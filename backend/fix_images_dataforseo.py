"""
For every Firestore product with an empty image field, query DataForSEO
Google Shopping to find a real product image and write it back.

Run from the backend directory:
    python fix_images_dataforseo.py
    python fix_images_dataforseo.py --batch-size 200 --dry-run --workers 4
"""
import argparse
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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

from firestore_products import PRODUCTS_COLLECTION, db
from web_products import (
    _clean_image,
    _extract_candidates,
    _has_dataforseo_credentials,
    _search_products_task,
)


def _dfs_image_for_product(brand: str, product_name: str) -> str:
    """Return the first valid image URL from DataForSEO Google Shopping."""
    query = f"{brand} {product_name}".strip()
    if not query:
        return ""
    try:
        result = _search_products_task(query, limit=5)
        for r in result or []:
            for c in _extract_candidates(r, fallback_brand=brand):
                img = _clean_image(str(c.get("image") or ""))
                if img:
                    return img
    except Exception as exc:
        print(f"  DataForSEO error for '{query}': {exc}", file=sys.stderr)
    return ""


def _fetch_image(doc_id: str, data: dict) -> tuple[str, str]:
    """Return (doc_id, image_url). Called in a thread pool."""
    brand = str(data.get("brand") or "").strip()
    name = str(data.get("product_name") or data.get("name") or "").strip()
    image = _dfs_image_for_product(brand, name)
    return doc_id, image


def fix_images(batch_size: int = 200, dry_run: bool = False, workers: int = 4):
    if db is None:
        print("ERROR: Firestore not connected", file=sys.stderr)
        return
    if not _has_dataforseo_credentials():
        print("ERROR: DataForSEO credentials not set", file=sys.stderr)
        return

    col = db.collection(PRODUCTS_COLLECTION)
    scanned = updated = found = 0

    print("Querying products with empty image ...")
    round_num = 0
    while True:
        round_num += 1
        try:
            page = list(col.where("image", "==", "").limit(batch_size).stream())
        except Exception as exc:
            print(f"  ERROR fetching batch (round {round_num}): {exc}", file=sys.stderr)
            break
        if not page:
            print("  No more docs with empty image.")
            break

        print(f"\nRound {round_num}: {len(page)} docs")
        docs = {doc.id: doc for doc in page}
        data_map = {doc.id: (doc.to_dict() or {}) for doc in page}
        scanned += len(page)

        # Fetch images in parallel
        results: dict[str, str] = {}
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_fetch_image, doc_id, data_map[doc_id]): doc_id for doc_id in docs}
            for future in as_completed(futures):
                doc_id, image = future.result()
                results[doc_id] = image

        # Write updates in one batch
        if not dry_run:
            batch = db.batch()
            writes = 0
            for doc_id, image in results.items():
                batch.update(docs[doc_id].reference, {"image": image})
                writes += 1
            if writes:
                batch.commit()

        for doc_id, image in results.items():
            data = data_map[doc_id]
            brand = data.get("brand") or ""
            name = (data.get("product_name") or data.get("name") or "")[:55]
            status = "SET" if image else "EMPTY"
            if image:
                found += 1
            updated += 1
            print(f"  [{status}] {brand} - {name}: {image[:80] or '(none found)'}")

        print(f"  subtotal: scanned={scanned} updated={updated} found={found}")

        if dry_run:
            print("(dry-run: stopping after first round)")
            break

        # Small pause to respect rate limits between rounds
        time.sleep(0.5)

    print(f"\nDone. scanned={scanned}, updated={updated}, images_found={found}")


def main():
    parser = argparse.ArgumentParser(description="Fill empty product images via DataForSEO.")
    parser.add_argument("--batch-size", type=int, default=200,
                        help="Docs per Firestore page (default 200)")
    parser.add_argument("--workers", type=int, default=4,
                        help="Parallel DataForSEO requests per round (default 4)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch images but do not write to Firestore")
    args = parser.parse_args()
    fix_images(batch_size=args.batch_size, dry_run=args.dry_run, workers=args.workers)


if __name__ == "__main__":
    main()
