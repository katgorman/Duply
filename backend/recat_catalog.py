"""
Re-categorize existing Firestore catalog products using the updated category logic.

Does NOT re-scrape — reads products, fixes type/category/subcategory fields for
anything that was landing in "Other" due to the old narrow CATEGORY_BUCKETS.

Run from the backend directory:
    python recat_catalog.py              # apply changes
    python recat_catalog.py --dry-run    # preview only
"""
import sys
import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

import firestore_products as fp
from web_products import _infer_product_type

DRY_RUN = "--dry-run" in sys.argv or os.getenv("RECAT_DRY_RUN", "") in {"1", "true", "yes"}
BATCH_SIZE = max(1, int(os.getenv("RECAT_BATCH_SIZE", "250")))


def _best_type(product):
    candidates = [
        product.get("subcategory"),
        product.get("type"),
        product.get("category"),
        product.get("productType"),
        (product.get("raw") or {}).get("category"),
        product.get("product_name"),
    ]
    for raw in candidates:
        if not raw:
            continue
        inferred = _infer_product_type(str(raw))
        if inferred and inferred != "general":
            return fp.normalize_product_type(inferred)
    return fp.normalize_product_type(
        str(product.get("type") or product.get("category") or "general")
    )


def main():
    if fp.db is None:
        print("ERROR: Firestore not configured. Check .env credentials.")
        sys.exit(1)

    collection = fp.db.collection(fp.PRODUCTS_COLLECTION)
    print(f"Scanning '{fp.PRODUCTS_COLLECTION}'...")

    docs = list(collection.stream())
    print(f"Total products: {len(docs)}")

    to_update = []
    for doc in docs:
        data = doc.to_dict() or {}
        data["firestore_id"] = doc.id

        current_bucket = fp._product_bucket(data)
        if current_bucket != "other":
            continue

        new_type = _best_type(data)
        if not new_type or new_type == "general":
            continue

        to_update.append((doc.reference, new_type, data))

    print(f"Products to fix (currently in 'other'): {len(to_update)}")

    if not to_update:
        print("Nothing to do.")
        return

    if DRY_RUN:
        print("\n--- DRY RUN preview (first 50) ---")
        for ref, new_type, data in to_update[:50]:
            old = data.get("type") or data.get("category") or "(none)"
            print(f"  {data.get('brand', '')!s:30s} {data.get('product_name', '')!s:40s}  {old!s:25s} -> {new_type}")
        if len(to_update) > 50:
            print(f"  ... and {len(to_update) - 50} more")
        print("\nRun without --dry-run to apply.")
        return

    written = 0
    for i in range(0, len(to_update), BATCH_SIZE):
        batch = fp.db.batch()
        for ref, new_type, _ in to_update[i : i + BATCH_SIZE]:
            batch.update(ref, {"type": new_type, "category": new_type, "subcategory": new_type})
        batch.commit()
        written += len(to_update[i : i + BATCH_SIZE])
        print(f"  Updated {written}/{len(to_update)}...")

    fp.invalidate_catalog_cache()
    print(f"\nDone. Fixed {written} products and cleared cache.")


if __name__ == "__main__":
    main()
