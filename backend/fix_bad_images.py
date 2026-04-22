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

# Patch SDK bug: grpc removed _retry attr; prevent crash in retry handler
try:
    import google.cloud.firestore_v1.query as _fsq
    _orig_retry = _fsq.BaseQuery._retry_query_after_exception
    def _safe_retry(self, exc, retry, transaction):
        try:
            return _orig_retry(self, exc, retry, transaction)
        except AttributeError:
            return False
    _fsq.BaseQuery._retry_query_after_exception = _safe_retry
except Exception:
    pass

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

    for bad_value in BAD_VALUES:
        print(f"Querying docs where image == '{bad_value}' ...")
        round_num = 0
        while True:
            round_num += 1
            try:
                page = list(col.where("image", "==", bad_value).limit(batch_size).stream())
            except Exception as exc:
                print(f"  ERROR fetching batch (round {round_num}): {exc}", file=sys.stderr)
                break
            if not page:
                print(f"  No more docs with this value.")
                break

            print(f"  Round {round_num}: {len(page)} docs")

            round_batch = db.batch()
            round_writes = 0

            for doc in page:
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
                    round_batch.update(doc.reference, {"image": new_image})
                    round_writes += 1

                updated += 1
                status = "SET" if new_image else "CLEARED"
                brand = data.get("brand") or ""
                name = data.get("product_name") or ""
                print(f"  [{status}] {brand} - {name[:60]}: {new_image[:80] or '(empty)'}")

            # Commit the whole round before re-querying so these docs leave the result set
            if round_writes > 0 and not dry_run:
                round_batch.commit()

            print(f"  subtotal: scanned={scanned} updated={updated} no_url={no_url} no_image_found={no_image_found}")

            if dry_run:
                break  # dry-run: just show one round

    print(f"\nDone. scanned={scanned}, needs_fix={needs_fix}, updated={updated}, no_url={no_url}, no_image_found={no_image_found}")


def main():
    parser = argparse.ArgumentParser(description="Fix bad product images in Firestore.")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--dry-run", action="store_true", help="Scan and report without writing")
    args = parser.parse_args()
    fix_bad_images(batch_size=args.batch_size, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
