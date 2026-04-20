import argparse
import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from web_products import augment_official_us_retailers


DEFAULT_RETAILERS = ("sephora", "ulta")


def _safe_int(value, default, minimum=0):
    try:
        return max(minimum, int(value))
    except (TypeError, ValueError):
        return default


def _parse_retailers(value):
    if value is None:
        return list(DEFAULT_RETAILERS)
    if isinstance(value, (list, tuple, set)):
        selected = [str(item).strip().lower() for item in value if str(item).strip()]
    else:
        selected = [item.strip().lower() for item in str(value).split(",") if item.strip()]
    return selected or list(DEFAULT_RETAILERS)


def _summarize_batch(result, fallback_start_index):
    retailer_summary = ((result.get("retailers") or [{}])[0] if result.get("retailers") else {})
    urls_processed = int(retailer_summary.get("urlsProcessed") or 0)
    return {
        "startIndex": int(retailer_summary.get("startIndex") or fallback_start_index),
        "nextStartIndex": int(
            retailer_summary.get("nextStartIndex")
            or (fallback_start_index + urls_processed)
        ),
        "urlsProcessed": urls_processed,
        "urlsDiscovered": int(retailer_summary.get("urlsDiscovered") or 0),
        "productsParsed": int(retailer_summary.get("productsParsed") or 0),
        "duplicatesSkipped": int(result.get("duplicatesSkipped") or 0),
        "written": int((result.get("firestore") or {}).get("written") or 0),
    }


def run_catalog_augmentation(
    retailers=None,
    batch_size=None,
    start_index=None,
    single_batch=False,
):
    selected_retailers = _parse_retailers(
        retailers if retailers is not None else os.getenv("DUPLY_AUGMENT_RETAILERS")
    )
    effective_batch_size = _safe_int(
        batch_size if batch_size is not None else os.getenv("DUPLY_AUGMENT_BATCH_SIZE"),
        default=250,
        minimum=1,
    )
    initial_start_index = _safe_int(
        start_index if start_index is not None else os.getenv("DUPLY_AUGMENT_START_INDEX"),
        default=0,
        minimum=0,
    )

    if single_batch:
        result = augment_official_us_retailers(
            retailers=selected_retailers,
            max_urls_per_retailer=effective_batch_size,
            start_index=initial_start_index,
        )
        return {
            **result,
            "batchSize": effective_batch_size,
            "mode": "single-batch",
            "retailersRequested": selected_retailers,
            "startIndex": initial_start_index,
        }

    crawl_summary = []
    total_products = 0
    total_duplicates = 0
    total_written = 0

    for retailer_index, retailer in enumerate(selected_retailers):
        retailer_start_index = initial_start_index if retailer_index == 0 else 0
        retailer_runs = []

        while True:
            result = augment_official_us_retailers(
                retailers=[retailer],
                max_urls_per_retailer=effective_batch_size,
                start_index=retailer_start_index,
            )
            batch_summary = _summarize_batch(result, retailer_start_index)
            retailer_runs.append(batch_summary)

            total_products += int(result.get("productsFound") or 0)
            total_duplicates += int(result.get("duplicatesSkipped") or 0)
            total_written += int((result.get("firestore") or {}).get("written") or 0)

            urls_discovered = batch_summary["urlsDiscovered"]
            urls_processed = batch_summary["urlsProcessed"]
            next_start_index = batch_summary["nextStartIndex"]
            is_complete = urls_processed <= 0 or (
                urls_discovered > 0 and next_start_index >= urls_discovered
            )
            if is_complete:
                crawl_summary.append(
                    {
                        "retailer": retailer,
                        "batches": retailer_runs,
                        "urlsDiscovered": urls_discovered,
                        "completed": True,
                    }
                )
                break

            retailer_start_index = next_start_index

    return {
        "retailers": crawl_summary,
        "productsFound": total_products,
        "duplicatesSkipped": total_duplicates,
        "written": total_written,
        "batchSize": effective_batch_size,
        "mode": "full-crawl",
        "retailersRequested": selected_retailers,
        "startIndex": initial_start_index,
    }


def _build_parser():
    parser = argparse.ArgumentParser(
        description="Augment the Firestore catalog from official Sephora and Ulta product pages."
    )
    parser.add_argument(
        "--retailers",
        default=None,
        help="Comma-separated retailer list. Defaults to DUPLY_AUGMENT_RETAILERS or sephora,ulta.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=None,
        help="URLs to process per retailer batch. Defaults to DUPLY_AUGMENT_BATCH_SIZE or 250.",
    )
    parser.add_argument(
        "--start-index",
        type=int,
        default=None,
        help="Optional starting sitemap index for the first retailer.",
    )
    parser.add_argument(
        "--single-batch",
        action="store_true",
        help="Run one batch only instead of crawling each retailer to completion.",
    )
    return parser


def main(argv=None):
    args = _build_parser().parse_args(argv)
    result = run_catalog_augmentation(
        retailers=args.retailers,
        batch_size=args.batch_size,
        start_index=args.start_index,
        single_batch=args.single_batch,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
