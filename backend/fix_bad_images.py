"""
Scan all Firestore product documents and re-fetch images for any that have
a missing or invalid image field. Writes updates back to Firestore in batches.

Run from the backend directory:
    python fix_bad_images.py
    python fix_bad_images.py --batch-size 200 --dry-run
"""
import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from firestore_products import (
    PRODUCTS_COLLECTION,
    _is_valid_product_image,
    db,
)
from web_products import _find_source_page_image, _clean_image


def _product_url(data):
    raw = data.get("raw") or {}
    return (
        data.get("productUrl")
        or data.get("title-href")
        or raw.get("productUrl")
        or raw.get("title-href")
        or ""
    )


def _best_offer_image(data):
    raw = data.get("raw") or {}
    for offer in (data.get("merchantOffers") or raw.get("merchantOffers") or []):
        if isinstance(offer, dict):
            img = _clean_image(str(offer.get("image") or ""))
            if img:
                return img
    return ""


def fix_bad_images(batch_size=500, dry_run=False):
    if db is None:
        print("ERROR: Firestore not connected", file=sys.stderr)
        return

    scanned = 0
    needs_fix = 0
    updated = 0
    no_url = 0
    no_image_found = 0

    col = db.collection(PRODUCTS_COLLECTION)

    # Only fetch docs that have the known bad image value — far fewer docs,
    # avoids full-collection scan timeout and the SDK _retry bug.
    BAD_VALUES = ["/images/Sephora_logo.jpg"]

    write_batch = db.batch()
    writes_in_batch = 0

    for bad_value in BAD_VALUES:
        print(f"Querying docs where image == '{bad_value}' ...")
        try:
            docs = list(col.where("image", "==", bad_value).limit(100000).stream())
        except Exception as exc:
            print(f"  ERROR fetching docs: {exc}", file=sys.stderr)
            continue

        print(f"  Found {len(docs)} docs to fix")

        for doc in docs:
            scanned += 1
            data = doc.to_dict() or {}
            needs_fix += 1

            new_image = _best_offer_image(data)

            if not new_image:
                url = _product_url(data)
                if not url:
                    no_url += 1
                    new_image = ""
                else:
                    new_image = _find_source_page_image(url)

            if not new_image:
                no_image_found += 1
                new_image = ""

            if not dry_run:
                write_batch.update(doc.reference, {"image": new_image})
                writes_in_batch += 1
                if writes_in_batch >= 400:
                    write_batch.commit()
                    write_batch = db.batch()
                    writes_in_batch = 0

            updated += 1
            status = "SET" if new_image else "CLEARED"
            brand = data.get("brand") or ""
            name = data.get("product_name") or ""
            print(f"  [{status}] {brand} - {name[:60]}: {new_image[:80] or '(empty)'}")

        print(f"  subtotal: scanned={scanned} updated={updated} no_url={no_url} no_image_found={no_image_found}")

    if writes_in_batch > 0 and not dry_run:
        write_batch.commit()

    print(f"\nDone. scanned={scanned}, needs_fix={needs_fix}, updated={updated}, no_url={no_url}, no_image_found={no_image_found}")


def main():
    parser = argparse.ArgumentParser(description="Fix bad product images in Firestore.")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true", help="Scan and report without writing")
    args = parser.parse_args()
    fix_bad_images(batch_size=args.batch_size, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
