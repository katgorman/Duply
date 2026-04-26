"""
Recrawl live official Sephora/Ulta listings, scrub stale official URLs from
Firestore, refresh product images, and clear stale web caches.

Run from the backend directory:
    python sync_official_catalog.py
    python sync_official_catalog.py --crawl-batch-size 200
    python sync_official_catalog.py --skip-crawl --max-docs 500
"""
import argparse
import json
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

# Patch SDK bug: grpc removed _retry attr; prevent crash in retry handler.
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

from augment_us_retailers import DEFAULT_RETAILERS
from firestore_products import (
    PRODUCTS_COLLECTION,
    WEB_CACHE_COLLECTION,
    _clean_image,
    _stream_collection_paginated,
    db,
    delete_firestore_products as _delete_product_docs,
    normalize_catalog_price,
    normalize_product_type,
    normalize_text,
    upsert_firestore_products,
)
from web_products import (
    OFFICIAL_US_RETAILERS,
    _collect_sitemap_product_urls,
    _extract_candidates,
    _find_source_page_image,
    _has_dataforseo_credentials,
    _normalize_retailer_name,
    _parse_official_retailer_product_page,
    _search_products_task,
    augment_official_us_retailers,
    is_supported_price_match_url,
)


OFFICIAL_CACHE_KINDS = (
    "web-search",
    "brand-catalog",
    "price-match",
)


def _summarize_crawl_batch(result, fallback_start_index):
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


def _crawl_official_catalog_with_progress(retailers, crawl_batch_size):
    crawl_summary = []
    total_products = 0
    total_duplicates = 0
    total_written = 0

    for retailer in retailers:
        retailer_runs = []
        retailer_start_index = 0
        batch_number = 0
        print(f"[crawl] retailer={retailer} starting")

        while True:
            batch_number += 1
            print(
                f"[crawl] retailer={retailer} batch={batch_number} "
                f"startIndex={retailer_start_index} batchSize={crawl_batch_size}"
            )
            result = augment_official_us_retailers(
                retailers=[retailer],
                max_urls_per_retailer=crawl_batch_size,
                start_index=retailer_start_index,
            )
            batch_summary = _summarize_crawl_batch(result, retailer_start_index)
            retailer_runs.append(batch_summary)

            total_products += int(result.get("productsFound") or 0)
            total_duplicates += int(result.get("duplicatesSkipped") or 0)
            total_written += int((result.get("firestore") or {}).get("written") or 0)

            print(
                f"[crawl] retailer={retailer} batch={batch_number} done "
                f"processed={batch_summary['urlsProcessed']} "
                f"discovered={batch_summary['urlsDiscovered']} "
                f"parsed={batch_summary['productsParsed']} "
                f"written={batch_summary['written']} "
                f"duplicates={batch_summary['duplicatesSkipped']} "
                f"nextStartIndex={batch_summary['nextStartIndex']}"
            )

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
                print(f"[crawl] retailer={retailer} completed")
                break

            retailer_start_index = next_start_index

    return {
        "retailers": crawl_summary,
        "productsFound": total_products,
        "duplicatesSkipped": total_duplicates,
        "written": total_written,
        "batchSize": crawl_batch_size,
        "mode": "full-crawl",
        "retailersRequested": list(retailers),
        "startIndex": 0,
    }


def _parse_retailers(value):
    if value is None:
        return list(DEFAULT_RETAILERS)
    if isinstance(value, (list, tuple, set)):
        selected = [str(item).strip().lower() for item in value if str(item).strip()]
    else:
        selected = [item.strip().lower() for item in str(value).split(",") if item.strip()]
    return [
        retailer
        for retailer in selected
        if _normalize_retailer_name(retailer) in OFFICIAL_US_RETAILERS
    ] or list(DEFAULT_RETAILERS)


def _doc_data(doc):
    return doc.to_dict() or {}


def _raw_data(data):
    raw = data.get("raw")
    return raw if isinstance(raw, dict) else {}


def _product_name(data):
    return str(
        data.get("Product_Name")
        or data.get("product_name")
        or data.get("name")
        or data.get("title")
        or ""
    ).strip()


def _product_brand(data):
    return str(data.get("Brand") or data.get("brand") or "").strip()


def _product_category(data):
    return str(data.get("Category") or data.get("category") or data.get("main_category") or "").strip()


def _product_type(data):
    return normalize_product_type(
        data.get("subcategory") or data.get("productType") or data.get("type") or _product_category(data)
    )


def _product_price(data):
    return normalize_catalog_price(
        data.get("Price_USD")
        or data.get("price")
        or data.get("salePrice")
        or data.get("current_price")
        or 0
    )


def _product_rating(data):
    try:
        return float(data.get("Rating") or data.get("rating") or data.get("avgRating") or 0)
    except (TypeError, ValueError):
        return 0.0


def _product_image(data):
    raw = _raw_data(data)
    merchant_offers = data.get("merchantOffers") or raw.get("merchantOffers") or []
    offer_image = ""
    for offer in merchant_offers:
        if isinstance(offer, dict):
            offer_image = _clean_image(offer.get("image") or "")
            if offer_image:
                break
    return _clean_image(
        data.get("image")
        or data.get("imageUrl")
        or data.get("image_link")
        or raw.get("image")
        or raw.get("imageUrl")
        or offer_image
        or ""
    )


def _primary_product_url(data):
    raw = _raw_data(data)
    for candidate in (
        data.get("productUrl"),
        data.get("title-href"),
        raw.get("productUrl"),
        raw.get("title-href"),
    ):
        url = str(candidate or "").strip()
        if url:
            return url
    return ""


def _normalized_url(url):
    return str(url or "").strip()


def _official_retailer_from_url(url):
    normalized_url = _normalized_url(url)
    if not normalized_url or not is_supported_price_match_url(normalized_url):
        return ""
    lowered = normalized_url.lower()
    if "ulta.com/p/" in lowered:
        return "ulta"
    if "sephora.com/product/" in lowered:
        return "sephora"
    return ""


def _is_google_shopping_redirect_url(url):
    lowered = _normalized_url(url).lower()
    return "google.com/search" in lowered and "ibp=oshop" in lowered


def _official_source(data):
    source = normalize_text(data.get("sourceProvider") or data.get("source"))
    return source if source in OFFICIAL_US_RETAILERS else ""


def _official_offer(offer):
    url = str((offer or {}).get("url") or "").strip()
    return _official_retailer_from_url(url)


def _offer_identity_key(offer):
    return (
        normalize_text((offer or {}).get("retailer")),
        normalize_text((offer or {}).get("title")),
        normalize_text((offer or {}).get("url")),
    )


def _canonical_product_url(product):
    if not isinstance(product, dict):
        return ""
    raw = product.get("raw") if isinstance(product.get("raw"), dict) else {}
    return str(
        product.get("productUrl")
        or product.get("title-href")
        or raw.get("productUrl")
        or raw.get("title-href")
        or ""
    ).strip()


def _canonical_product_offer(product):
    if not isinstance(product, dict):
        return {}
    raw = product.get("raw") if isinstance(product.get("raw"), dict) else {}
    offers = product.get("merchantOffers") or raw.get("merchantOffers") or []
    for offer in offers:
        if isinstance(offer, dict) and str(offer.get("url") or "").strip():
            return {
                "id": offer.get("id") or "",
                "retailer": offer.get("retailer") or product.get("website") or _official_retailer_from_url(offer.get("url")),
                "title": offer.get("title") or product.get("product_name") or "",
                "price": normalize_catalog_price(offer.get("price")),
                "url": str(offer.get("url") or "").strip(),
                "image": _clean_image(offer.get("image") or product.get("image") or ""),
                "shipping": offer.get("shipping") or product.get("availabilityStatus") or "",
                "source": offer.get("source") or product.get("source") or "",
                "matchConfidence": int(offer.get("matchConfidence") or 100),
            }
    url = _canonical_product_url(product)
    if not url:
        return {}
    return {
        "id": f"offer-{abs(hash(url)) % 10**12}",
        "retailer": product.get("website") or _official_retailer_from_url(url),
        "title": product.get("product_name") or "",
        "price": normalize_catalog_price(product.get("price")),
        "url": url,
        "image": _clean_image(product.get("image") or ""),
        "shipping": product.get("availabilityStatus") or "",
        "source": product.get("source") or "",
        "matchConfidence": 100,
    }


def _existing_payload(doc_id, data, *, image=None, product_url=None, merchant_offers=None, availability_status=None):
    raw = _raw_data(data)
    resolved_product_url = _normalized_url(product_url if product_url is not None else _primary_product_url(data))
    resolved_merchant_offers = merchant_offers if merchant_offers is not None else list(data.get("merchantOffers") or raw.get("merchantOffers") or [])
    resolved_availability = str(
        availability_status
        if availability_status is not None
        else (
            data.get("availabilityStatus")
            or raw.get("availabilityStatus")
            or (resolved_merchant_offers[0].get("shipping") if resolved_merchant_offers else "")
            or "active"
        )
    ).strip() or "active"
    resolved_image = image if image is not None else _product_image(data)
    merchant_domain = resolved_product_url.split("/")[2] if "://" in resolved_product_url else ""

    updated_raw = {
        **raw,
        "productUrl": resolved_product_url,
        "merchantOffers": resolved_merchant_offers,
        "availabilityStatus": resolved_availability,
    }

    return {
        "firestore_id": doc_id,
        "brand": _product_brand(data),
        "product_name": _product_name(data),
        "category": _product_category(data),
        "subcategory": _product_type(data),
        "type": _product_type(data),
        "price": _product_price(data),
        "rating": _product_rating(data),
        "image": resolved_image,
        "productUrl": resolved_product_url,
        "source": str(data.get("sourceProvider") or data.get("source") or "catalog").strip() or "catalog",
        "availabilityStatus": resolved_availability,
        "merchantOffers": resolved_merchant_offers,
        "merchantDomain": merchant_domain,
        "lastSeenAt": int(data.get("lastSeenAt") or time.time()),
        "lastValidatedAt": int(time.time()),
        "raw": updated_raw,
    }


def _build_live_official_url_sets(retailers):
    live_urls = {}
    for retailer in retailers:
        config = OFFICIAL_US_RETAILERS.get(retailer) or {}
        urls = _collect_sitemap_product_urls(
            config.get("sitemaps") or [],
            config.get("productUrlPattern") or "",
            0,
            force_refresh=True,
        )
        live_urls[retailer] = {_normalized_url(url) for url in urls if _normalized_url(url)}
        print(f"[sitemap] {retailer}: {len(live_urls[retailer])} live product URLs")
    return live_urls


def _official_url_is_live(url, live_url_sets):
    normalized_url = _normalized_url(url)
    retailer = _official_retailer_from_url(normalized_url)
    if not retailer:
        return False
    return normalized_url in live_url_sets.get(retailer, set())


def _parse_live_official_product(url, live_url_sets, parsed_cache):
    normalized_url = _normalized_url(url)
    retailer = _official_retailer_from_url(normalized_url)
    if not retailer:
        return None

    if normalized_url in parsed_cache:
        return parsed_cache[normalized_url]

    product = _parse_official_retailer_product_page(normalized_url, retailer)
    parsed_cache[normalized_url] = product
    if product:
        canonical_url = _canonical_product_url(product)
        if canonical_url:
            live_url_sets.setdefault(retailer, set()).add(canonical_url)
            parsed_cache[_normalized_url(canonical_url)] = product
    return product


def _dfs_image_for_product(brand, product_name):
    if not _has_dataforseo_credentials():
        return ""
    query = f"{brand} {product_name}".strip()
    if not query:
        return ""
    for attempt in range(2):
        try:
            result = _search_products_task(query, limit=5)
            for row in result or []:
                for candidate in _extract_candidates(row, fallback_brand=brand):
                    image = _clean_image(str(candidate.get("image") or ""))
                    if image:
                        return image
            return ""
        except Exception:
            if attempt == 0:
                time.sleep(5)
                continue
    return ""


def _resolve_image(data, canonical_url, live_offers, parsed_primary):
    candidates = []
    if isinstance(parsed_primary, dict):
        candidates.append(_clean_image(parsed_primary.get("image") or ""))

    for offer in live_offers or []:
        candidates.append(_clean_image((offer or {}).get("image") or ""))

    candidates.append(_product_image(data))

    for candidate in candidates:
        if candidate:
            return candidate

    if canonical_url:
        source_image = _find_source_page_image(canonical_url)
        if source_image:
            return source_image

    return _dfs_image_for_product(_product_brand(data), _product_name(data))


def _clean_non_official_record(doc_id, data, live_url_sets, parsed_cache):
    primary_url = _primary_product_url(data)
    primary_retailer = _official_retailer_from_url(primary_url)
    parsed_primary = None
    if primary_retailer and not _official_url_is_live(primary_url, live_url_sets):
        parsed_primary = _parse_live_official_product(primary_url, live_url_sets, parsed_cache)

    raw = _raw_data(data)
    merchant_offers = data.get("merchantOffers") or raw.get("merchantOffers") or []
    cleaned_offers = []
    seen_offers = set()
    official_offers_removed = 0

    for offer in merchant_offers:
        if not isinstance(offer, dict):
            continue
        offer_url = str(offer.get("url") or "").strip()
        offer_retailer = _official_offer(offer)

        if offer_retailer:
            if _official_url_is_live(offer_url, live_url_sets):
                normalized_offer = {
                    "id": offer.get("id") or "",
                    "retailer": offer.get("retailer") or offer_retailer,
                    "title": offer.get("title") or "",
                    "price": normalize_catalog_price(offer.get("price")),
                    "url": offer_url,
                    "image": _clean_image(offer.get("image") or ""),
                    "shipping": offer.get("shipping") or "",
                    "source": offer.get("source") or "",
                    "matchConfidence": int(offer.get("matchConfidence") or 100),
                }
            else:
                parsed_offer_product = _parse_live_official_product(offer_url, live_url_sets, parsed_cache)
                if not parsed_offer_product:
                    official_offers_removed += 1
                    continue
                normalized_offer = _canonical_product_offer(parsed_offer_product)
        else:
            normalized_offer = {
                "id": offer.get("id") or "",
                "retailer": offer.get("retailer") or "",
                "title": offer.get("title") or "",
                "price": normalize_catalog_price(offer.get("price")),
                "url": offer_url,
                "image": _clean_image(offer.get("image") or ""),
                "shipping": offer.get("shipping") or "",
                "source": offer.get("source") or "",
                "matchConfidence": int(offer.get("matchConfidence") or 100),
            }

        if not normalized_offer.get("url"):
            continue

        identity = _offer_identity_key(normalized_offer)
        if identity in seen_offers:
            continue
        seen_offers.add(identity)
        cleaned_offers.append(normalized_offer)

    cleaned_offers.sort(
        key=lambda offer: (
            normalize_catalog_price(offer.get("price")) <= 0,
            normalize_catalog_price(offer.get("price")) if normalize_catalog_price(offer.get("price")) > 0 else 10**9,
            normalize_text(offer.get("retailer")),
            normalize_text(offer.get("title")),
        )
    )

    canonical_url = primary_url
    if primary_retailer:
        canonical_url = _canonical_product_url(parsed_primary) if parsed_primary else ""
    if not canonical_url:
        canonical_url = next(
            (str(offer.get("url") or "").strip() for offer in cleaned_offers if str(offer.get("url") or "").strip()),
            "",
        )

    image = _resolve_image(data, canonical_url, cleaned_offers, parsed_primary)
    price = _product_price(data)
    if price <= 0:
        price = next(
            (normalize_catalog_price(offer.get("price")) for offer in cleaned_offers if normalize_catalog_price(offer.get("price")) > 0),
            0,
        )

    availability_status = str(
        data.get("availabilityStatus")
        or raw.get("availabilityStatus")
        or (cleaned_offers[0].get("shipping") if cleaned_offers else "")
        or "active"
    ).strip() or "active"

    merchant_domain = ""
    if "://" in canonical_url:
        merchant_domain = canonical_url.split("/")[2]

    updated_raw = {
        **raw,
        "productUrl": canonical_url,
        "merchantOffers": cleaned_offers,
        "availabilityStatus": availability_status,
    }

    payload = {
        "firestore_id": doc_id,
        "brand": _product_brand(data),
        "product_name": _product_name(data),
        "category": _product_category(data),
        "subcategory": _product_type(data),
        "type": _product_type(data),
        "price": price,
        "rating": _product_rating(data),
        "image": image,
        "productUrl": canonical_url,
        "source": str(data.get("sourceProvider") or data.get("source") or "catalog").strip() or "catalog",
        "availabilityStatus": availability_status,
        "merchantOffers": cleaned_offers,
        "merchantDomain": merchant_domain,
        "lastSeenAt": int(data.get("lastSeenAt") or time.time()),
        "lastValidatedAt": int(time.time()),
        "raw": updated_raw,
    }

    changed = (
        official_offers_removed > 0
        or _normalized_url(primary_url) != _normalized_url(canonical_url)
        or _product_image(data) != image
        or (data.get("merchantOffers") or raw.get("merchantOffers") or []) != cleaned_offers
    )

    return {
        "changed": changed,
        "officialOffersRemoved": official_offers_removed,
        "payload": payload,
    }


def _clear_cache_kinds(cache_kinds, dry_run=False):
    if db is None:
        return {"cleared": 0, "available": False}

    deleted = 0
    batch = db.batch()
    writes = 0

    for cache_kind in cache_kinds:
        query = db.collection(WEB_CACHE_COLLECTION).where("cacheKind", "==", normalize_text(cache_kind))
        docs = list(query.stream())
        for doc in docs:
            deleted += 1
            if dry_run:
                continue
            batch.delete(doc.reference)
            writes += 1
            if writes % 400 == 0:
                batch.commit()
                batch = db.batch()

    if writes and not dry_run:
        batch.commit()

    return {"cleared": deleted, "available": True}


def sync_official_catalog(
    retailers=None,
    crawl_batch_size=250,
    skip_crawl=False,
    max_docs=0,
    dry_run=False,
    clear_caches=True,
):
    if db is None:
        print("ERROR: Firestore not connected", file=sys.stderr)
        return None

    selected_retailers = _parse_retailers(retailers)
    crawl_summary = None

    if not skip_crawl:
        print("[crawl] recrawling official retailer sitemaps into Firestore ...")
        crawl_summary = _crawl_official_catalog_with_progress(selected_retailers, crawl_batch_size)
        print(
            "[crawl] done:",
            json.dumps(
                {
                    "productsFound": crawl_summary.get("productsFound"),
                    "duplicatesSkipped": crawl_summary.get("duplicatesSkipped"),
                    "written": crawl_summary.get("written"),
                }
            ),
        )

    print("[scrub] loading current live official URL sets ...")
    live_url_sets = _build_live_official_url_sets(selected_retailers)
    parsed_cache = {}

    docs = _stream_collection_paginated(PRODUCTS_COLLECTION, page_size=400, page_timeout=45.0)
    if max_docs > 0:
        docs = docs[:max_docs]

    upserts = {}
    delete_ids = []
    scanned = 0
    official_source_deleted = 0
    official_source_refreshed = 0
    cleaned_non_official = 0
    official_offers_removed = 0
    images_refreshed = 0
    badRedirectDocsDeleted = 0

    for doc in docs:
        scanned += 1
        data = _doc_data(doc)
        if scanned % 500 == 0:
            print(
                f"[scrub] scanned={scanned} rewritten_pending={len(upserts)} "
                f"delete_pending={len(delete_ids)} official_removed={official_offers_removed}"
            )
        source = _official_source(data)
        primary_url = _primary_product_url(data)
        merchant_offers = data.get("merchantOffers") or _raw_data(data).get("merchantOffers") or []
        official_offers = [offer for offer in merchant_offers if _official_offer(offer)]

        has_official_offer = bool(official_offers)
        if not source and _is_google_shopping_redirect_url(primary_url) and not has_official_offer:
            delete_ids.append(doc.id)
            badRedirectDocsDeleted += 1
            continue

        if not source and not _official_retailer_from_url(primary_url) and not has_official_offer:
            continue

        before_image = _product_image(data)

        if source:
            if _official_url_is_live(primary_url, live_url_sets):
                if before_image:
                    continue
                parsed_primary = _parse_live_official_product(primary_url, live_url_sets, parsed_cache)
                if parsed_primary:
                    replacement_id = parsed_primary.get("firestore_id") or doc.id
                    upserts[replacement_id] = parsed_primary
                    official_source_refreshed += 1
                    if replacement_id != doc.id:
                        delete_ids.append(doc.id)
                        official_source_deleted += 1
                    if _clean_image(parsed_primary.get("image") or "") and _clean_image(parsed_primary.get("image") or "") != before_image:
                        images_refreshed += 1
                    continue

                refreshed_image = _find_source_page_image(primary_url) or _dfs_image_for_product(_product_brand(data), _product_name(data))
                if not refreshed_image:
                    continue
                upserts[doc.id] = _existing_payload(doc.id, data, image=refreshed_image)
                official_source_refreshed += 1
                if refreshed_image != before_image:
                    images_refreshed += 1
                continue

            parsed_primary = _parse_live_official_product(primary_url, live_url_sets, parsed_cache)
            if not parsed_primary:
                delete_ids.append(doc.id)
                official_source_deleted += 1
                continue

            replacement_id = parsed_primary.get("firestore_id") or doc.id
            upserts[replacement_id] = parsed_primary
            official_source_refreshed += 1
            if replacement_id != doc.id:
                delete_ids.append(doc.id)
                official_source_deleted += 1
            if _clean_image(parsed_primary.get("image") or "") and _clean_image(parsed_primary.get("image") or "") != before_image:
                images_refreshed += 1
            continue

        cleaned = _clean_non_official_record(doc.id, data, live_url_sets, parsed_cache)
        official_offers_removed += cleaned["officialOffersRemoved"]
        if not cleaned["changed"]:
            continue
        cleaned_non_official += 1
        if _clean_image(cleaned["payload"].get("image") or "") and _clean_image(cleaned["payload"].get("image") or "") != before_image:
            images_refreshed += 1
        upserts[doc.id] = cleaned["payload"]

    if dry_run:
        write_result = {"written": len(upserts), "available": True}
        delete_result = {"deleted": len(set(delete_ids)), "available": True}
    else:
        write_result = upsert_firestore_products(list(upserts.values()))
        delete_result = _delete_product_docs(list(dict.fromkeys(delete_ids)))

    cache_result = {"cleared": 0, "available": bool(db)}
    if clear_caches:
        print("[cache] clearing stale web caches ...")
        cache_result = _clear_cache_kinds(OFFICIAL_CACHE_KINDS, dry_run=dry_run)

    summary = {
        "crawl": crawl_summary or {"skipped": True},
        "scrub": {
            "scanned": scanned,
            "rewritten": write_result.get("written", 0),
            "deleted": delete_result.get("deleted", 0),
            "officialSourceRefreshed": official_source_refreshed,
            "officialSourceDeleted": official_source_deleted,
            "nonOfficialDocsCleaned": cleaned_non_official,
            "officialOffersRemoved": official_offers_removed,
            "imagesRefreshed": images_refreshed,
            "badRedirectDocsDeleted": badRedirectDocsDeleted,
        },
        "cache": cache_result,
        "dryRun": bool(dry_run),
    }
    return summary


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Recrawl live Sephora/Ulta listings and scrub stale official URLs from Firestore."
    )
    parser.add_argument(
        "--retailers",
        default=None,
        help="Comma-separated retailer list. Defaults to sephora,ulta.",
    )
    parser.add_argument(
        "--crawl-batch-size",
        type=int,
        default=250,
        help="URLs per retailer batch while recrawling official sitemaps.",
    )
    parser.add_argument(
        "--skip-crawl",
        action="store_true",
        help="Skip the official recrawl and only scrub existing Firestore docs.",
    )
    parser.add_argument(
        "--max-docs",
        type=int,
        default=0,
        help="Optional cap on Firestore docs to inspect during scrub.",
    )
    parser.add_argument(
        "--keep-caches",
        action="store_true",
        help="Do not clear stale web-search/brand-catalog/price-match cache docs.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the plan without writing or deleting Firestore data.",
    )
    args = parser.parse_args(argv)

    summary = sync_official_catalog(
        retailers=args.retailers,
        crawl_batch_size=max(1, args.crawl_batch_size),
        skip_crawl=args.skip_crawl,
        max_docs=max(0, args.max_docs),
        dry_run=args.dry_run,
        clear_caches=not args.keep_caches,
    )
    if summary is None:
        raise SystemExit(1)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
