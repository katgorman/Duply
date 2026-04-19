import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from web_products import augment_official_us_retailers


def main():
    retailers = ["sephora", "ulta"]
    batch_size = max(1, int(os.getenv("DUPLY_AUGMENT_BATCH_SIZE", "250")))
    crawl_summary = []
    total_products = 0
    total_duplicates = 0
    total_written = 0

    for retailer in retailers:
        start_index = 0
        retailer_runs = []

        while True:
            result = augment_official_us_retailers(
                retailers=[retailer],
                max_urls_per_retailer=batch_size,
                start_index=start_index,
            )
            retailer_summary = ((result.get("retailers") or [{}])[0] if result.get("retailers") else {})
            retailer_runs.append({
                "startIndex": retailer_summary.get("startIndex", start_index),
                "nextStartIndex": retailer_summary.get("nextStartIndex", start_index),
                "urlsProcessed": retailer_summary.get("urlsProcessed", 0),
                "urlsDiscovered": retailer_summary.get("urlsDiscovered", 0),
                "productsParsed": retailer_summary.get("productsParsed", 0),
                "duplicatesSkipped": result.get("duplicatesSkipped", 0),
                "written": (result.get("firestore") or {}).get("written", 0),
            })
            total_products += int(result.get("productsFound") or 0)
            total_duplicates += int(result.get("duplicatesSkipped") or 0)
            total_written += int((result.get("firestore") or {}).get("written") or 0)

            urls_discovered = int(retailer_summary.get("urlsDiscovered") or 0)
            urls_processed = int(retailer_summary.get("urlsProcessed") or 0)
            next_start_index = int(retailer_summary.get("nextStartIndex") or (start_index + urls_processed))
            if urls_processed <= 0 or (urls_discovered > 0 and next_start_index >= urls_discovered):
                crawl_summary.append({
                    "retailer": retailer,
                    "batches": retailer_runs,
                    "urlsDiscovered": urls_discovered,
                    "completed": True,
                })
                break

            start_index = next_start_index

    print(json.dumps({
        "retailers": crawl_summary,
        "productsFound": total_products,
        "duplicatesSkipped": total_duplicates,
        "written": total_written,
        "batchSize": batch_size,
    }, indent=2))


if __name__ == "__main__":
    main()
