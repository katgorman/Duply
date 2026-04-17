import base64
import hashlib
import html
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from firestore_products import build_catalog_product_id, normalize_product_type, normalize_text, upsert_firestore_products

BASE_DIR = Path(__file__).resolve().parent
METADATA_PATH = BASE_DIR / "cosmetics_metadata.json"

DATAFORSEO_LOGIN = os.getenv("DATAFORSEO_LOGIN", "").strip()
DATAFORSEO_PASSWORD = os.getenv("DATAFORSEO_PASSWORD", "").strip()
DATAFORSEO_BASE_URL = os.getenv("DATAFORSEO_BASE_URL", "https://api.dataforseo.com").strip().rstrip("/")
DATAFORSEO_LOCATION_CODE = int(os.getenv("DATAFORSEO_LOCATION_CODE", "2840"))
DATAFORSEO_LANGUAGE_CODE = os.getenv("DATAFORSEO_LANGUAGE_CODE", "en").strip() or "en"
DATAFORSEO_DEVICE = os.getenv("DATAFORSEO_DEVICE", "desktop").strip() or "desktop"
DATAFORSEO_OS = os.getenv("DATAFORSEO_OS", "windows").strip() or "windows"
DATAFORSEO_TASK_TIMEOUT_SECONDS = int(os.getenv("DATAFORSEO_TASK_TIMEOUT_SECONDS", "90"))
DATAFORSEO_POLL_INTERVAL_SECONDS = float(os.getenv("DATAFORSEO_POLL_INTERVAL_SECONDS", "2.0"))
SOURCE_IMAGE_LOOKUP_ENABLED = os.getenv("DUPLY_SOURCE_IMAGE_LOOKUP_ENABLED", "true").strip().lower() in {"1", "true", "yes"}
WEB_SEARCH_CACHE_TTL_SECONDS = int(os.getenv("DUPLY_WEB_SEARCH_CACHE_TTL_SECONDS", "3600"))
WEB_IMAGE_CACHE_TTL_SECONDS = int(os.getenv("DUPLY_WEB_IMAGE_CACHE_TTL_SECONDS", "86400"))
URL_STATUS_CACHE_TTL_SECONDS = int(os.getenv("DUPLY_URL_STATUS_CACHE_TTL_SECONDS", "21600"))
URL_CHECK_TIMEOUT_SECONDS = int(os.getenv("DUPLY_URL_CHECK_TIMEOUT_SECONDS", "5"))

DEAD_PAGE_MARKERS = [
    "product not found", "page not found", "404 not found", "error 404",
    "this product is no longer available", "this product is unavailable", "this product has been discontinued",
]
LIVE_PAGE_MARKERS = ["add to bag", "add to cart", "buy now", "product details", "ingredients", "reviews", "ratings"]

TOP_BRANDS = {
    "l'oreal paris": "L'Oréal Paris", "maybelline new york": "Maybelline New York",
    "e.l.f. cosmetics": "e.l.f. Cosmetics", "nyx professional makeup": "NYX Professional Makeup",
    "revlon": "Revlon", "covergirl": "CoverGirl", "estee lauder": "Estée Lauder",
    "mac cosmetics": "MAC Cosmetics", "tarte cosmetics": "Tarte Cosmetics",
    "nars cosmetics": "NARS Cosmetics", "dior beauty": "Dior Beauty", "chanel beauty": "Chanel Beauty",
    "rare beauty": "Rare Beauty", "fenty beauty": "Fenty Beauty", "charlotte tilbury": "Charlotte Tilbury",
    "glossier": "Glossier", "rhode": "Rhode", "sol de janeiro": "Sol de Janeiro", "milk makeup": "Milk Makeup",
}
TOP_BRAND_ALIASES = {
    "loreal paris": "l'oreal paris", "l'oréal paris": "l'oreal paris", "estée lauder": "estee lauder",
    "mac": "mac cosmetics", "nars": "nars cosmetics", "tarte": "tarte cosmetics",
    "dior": "dior beauty", "chanel": "chanel beauty", "elf cosmetics": "e.l.f. cosmetics",
    "elf": "e.l.f. cosmetics", "nyx": "nyx professional makeup",
}
CATEGORY_SEARCH_TERMS = {
    "foundation": "foundation", "concealer": "concealer", "blush": "blush", "bronzer": "bronzer",
    "powder": "powder", "primer": "primer", "highlighter": "highlighter", "lipstick": "lipstick",
    "eyeshadow": "eyeshadow palette", "eyeliner": "eyeliner", "mascara": "mascara", "eyebrow": "brow makeup",
}
DEFAULT_AUGMENT_CATEGORIES = ["foundation", "concealer", "blush", "bronzer", "powder", "primer", "highlighter", "lipstick", "eyeshadow", "eyeliner", "mascara", "eyebrow"]

_allowed_brands = None
_search_cache, _image_cache, _web_product_cache, _price_match_cache, _url_status_cache = {}, {}, {}, {}, {}


def _cache_ttl(cache):
    return WEB_IMAGE_CACHE_TTL_SECONDS if cache is _image_cache else URL_STATUS_CACHE_TTL_SECONDS if cache is _url_status_cache else WEB_SEARCH_CACHE_TTL_SECONDS


def _cache_get(cache, key):
    entry = cache.get(key)
    if not entry:
        return None
    cached_at, value = entry
    if (time.time() - cached_at) > _cache_ttl(cache):
        cache.pop(key, None)
        return None
    return value


def _cache_set(cache, key, value):
    cache[key] = (time.time(), value)


def _load_allowed_brands():
    global _allowed_brands
    if _allowed_brands is not None:
        return _allowed_brands
    if not METADATA_PATH.exists():
        _allowed_brands = {}
        return _allowed_brands
    try:
        products = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    except Exception:
        _allowed_brands = {}
        return _allowed_brands
    brands = {}
    for product in products:
        brand = str(product.get("brand") or "").strip()
        normalized = normalize_text(brand)
        if brand and normalized and normalized not in brands:
            brands[normalized] = brand
    _allowed_brands = brands
    return _allowed_brands


def _canonical_top_brand(value):
    normalized = normalize_text(value)
    return normalized if normalized in TOP_BRANDS else TOP_BRAND_ALIASES.get(normalized, "")


def _display_brand(value):
    canonical = _canonical_top_brand(value)
    return TOP_BRANDS[canonical] if canonical else str(value or "").strip()


def _find_supported_brand(text):
    normalized_text = f" {normalize_text(text)} "
    matches = []
    for normalized_brand, display_brand in {**_load_allowed_brands(), **TOP_BRANDS}.items():
        if f" {normalized_brand} " in normalized_text:
            matches.append((len(normalized_brand), display_brand))
    for alias, canonical in TOP_BRAND_ALIASES.items():
        if f" {alias} " in normalized_text:
            matches.append((len(alias), TOP_BRANDS[canonical]))
    matches.sort(reverse=True)
    return matches[0][1] if matches else ""


def _source_domain(url):
    match = re.search(r"https?://(?:www\.)?([^/?#]+)", str(url or ""), flags=re.IGNORECASE)
    return match.group(1).lower() if match else ""


def is_approved_retailer_url(url):
    return str(url or "").strip().startswith(("http://", "https://")) and "." in _source_domain(url)


def _looks_like_missing_page(page_html, final_url=""):
    text, final_url = normalize_text(page_html), normalize_text(final_url)
    if any(marker in text for marker in LIVE_PAGE_MARKERS):
        return False
    return any(marker in text for marker in DEAD_PAGE_MARKERS) or "/404" in final_url or "not-found" in final_url


def is_live_product_url(url):
    url = str(url or "").strip()
    if not is_approved_retailer_url(url):
        return False
    key = ("url", normalize_text(url))
    cached = _cache_get(_url_status_cache, key)
    if cached is not None:
        return cached
    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; Duply/1.0)", "Accept": "text/html,application/xhtml+xml"})
        with urlopen(request, timeout=URL_CHECK_TIMEOUT_SECONDS) as response:
            status = getattr(response, "status", 200) or 200
            final_url = response.geturl()
            page_html = response.read(120000).decode("utf-8", errors="ignore")
        live = status < 400 and not _looks_like_missing_page(page_html, final_url)
    except Exception:
        live = False
    _cache_set(_url_status_cache, key, live)
    return live


def _find_source_page_image(product_url):
    product_url = str(product_url or "").strip()
    if not SOURCE_IMAGE_LOOKUP_ENABLED or not product_url:
        return ""
    key = ("source-image", normalize_text(product_url))
    cached = _cache_get(_image_cache, key)
    if cached is not None:
        return cached
    try:
        request = Request(product_url, headers={"User-Agent": "Mozilla/5.0 (compatible; Duply/1.0)", "Accept": "text/html,application/xhtml+xml"})
        with urlopen(request, timeout=4) as response:
            page_html = response.read(400000).decode("utf-8", errors="ignore")
            final_url = response.geturl()
    except Exception:
        _cache_set(_image_cache, key, "")
        return ""
    for pattern in [
        r'<meta[^>]+property=["\']og:image(?::secure_url)?["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+name=["\']twitter:image(?::src)?["\'][^>]+content=["\']([^"\']+)["\']',
    ]:
        match = re.search(pattern, page_html, flags=re.IGNORECASE)
        if match:
            image_url = html.unescape(match.group(1).replace("\\/", "/").strip())
            if image_url.startswith("//"):
                image_url = f"https:{image_url}"
            elif image_url.startswith("/"):
                image_url = urljoin(final_url, image_url)
            _cache_set(_image_cache, key, image_url)
            return image_url
    _cache_set(_image_cache, key, "")
    return ""


def find_product_image(brand, product_name, product_url=""):
    return _find_source_page_image(product_url)


def _extract_price(raw_value):
    if raw_value is None:
        return 0
    if isinstance(raw_value, (int, float)):
        return round(float(raw_value), 2)
    match = re.search(r"(\d+(?:\.\d{1,2})?)", str(raw_value).replace(",", ""))
    return round(float(match.group(1)), 2) if match else 0


def _infer_product_type(title):
    text = normalize_text(title)
    for needle, product_type in CATEGORY_SEARCH_TERMS.items():
        if needle in text or CATEGORY_SEARCH_TERMS[needle] in text:
            return normalize_product_type(needle)
    return "general"


def _meaningful_tokens(value):
    tokens = re.findall(r"[a-z0-9]+", normalize_text(value))
    return [token for token in tokens if len(token) > 2 and token not in {"the", "and", "for", "with", "new", "makeup", "product", "set", "mini"}]


def title_match_confidence(title, brand, product_name):
    text, brand_text = normalize_text(title), normalize_text(brand)
    if brand_text and brand_text not in text:
        return 0
    tokens = _meaningful_tokens(product_name)
    if not tokens:
        return 60 if brand_text else 0
    matched = sum(1 for token in tokens[:8] if token in text)
    return round((matched / min(len(tokens), 8)) * 75 + (25 if brand_text and brand_text in text else 0))


def _has_dataforseo_credentials():
    return bool(DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD)


def _dataforseo_request(path, method="GET", payload=None):
    if not _has_dataforseo_credentials():
        raise RuntimeError("DataForSEO credentials are not configured")
    auth = base64.b64encode(f"{DATAFORSEO_LOGIN}:{DATAFORSEO_PASSWORD}".encode("utf-8")).decode("ascii")
    request = Request(
        f"{DATAFORSEO_BASE_URL}{path}",
        data=(json.dumps(payload).encode("utf-8") if payload is not None else None),
        headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"DataForSEO HTTP {exc.code}: {body}") from exc
    except URLError as exc:
        raise RuntimeError(f"DataForSEO connection failed: {exc}") from exc


def _post_task(path, task):
    response = _dataforseo_request(path, method="POST", payload=[task])
    tasks = response.get("tasks") or []
    task_id = (tasks[0] or {}).get("id") if tasks else ""
    if not task_id:
        raise RuntimeError(f"DataForSEO task creation failed: {json.dumps(response)}")
    return task_id


def _poll_task(path_template, task_id):
    deadline = time.time() + DATAFORSEO_TASK_TIMEOUT_SECONDS
    last = {}
    while time.time() < deadline:
        response = _dataforseo_request(path_template.format(task_id=task_id))
        tasks = response.get("tasks") or []
        last = tasks[0] if tasks else {}
        status_code = int(last.get("status_code") or 0)
        if status_code == 20000:
            return last.get("result") or []
        if status_code >= 40000:
            raise RuntimeError(f"DataForSEO task failed: {json.dumps(last)}")
        time.sleep(DATAFORSEO_POLL_INTERVAL_SECONDS)
    raise RuntimeError(f"DataForSEO task timed out: {json.dumps(last)}")


def _task_defaults():
    return {
        "location_code": DATAFORSEO_LOCATION_CODE,
        "language_code": DATAFORSEO_LANGUAGE_CODE,
        "device": DATAFORSEO_DEVICE,
        "os": DATAFORSEO_OS,
    }


def _search_products_task(query, limit):
    task_id = _post_task("/v3/merchant/google/products/task_post", {**_task_defaults(), "keyword": query, "limit": max(limit, 10)})
    return _poll_task("/v3/merchant/google/products/task_get/advanced/{task_id}", task_id)


def _flatten_items(result):
    items = []
    for item in (result or {}).get("items") or []:
        nested = item.get("items")
        items.extend(nested if isinstance(nested, list) else [item])
    return items


def _extract(item, *keys):
    for key in keys:
        value = item.get(key)
        if value not in (None, "", []):
            return value
    return None


def _extract_candidates(result, fallback_brand=""):
    candidates = []
    for item in _flatten_items(result):
        title = str(_extract(item, "title", "name") or "").strip()
        if not title:
            continue
        image = _extract(item, "image_url", "thumbnail", "image")
        image = image[0] if isinstance(image, list) and image else image or ""
        candidates.append({
            "title": title,
            "brand": _find_supported_brand(title) or _display_brand(fallback_brand),
            "price": _extract_price(_extract(item, "price", "price_from", "price_to", "current_price")),
            "rating": float(_extract(item, "rating", "seller_rating") or 0),
            "image": str(image or ""),
            "shopping_url": str(_extract(item, "shopping_url", "url") or ""),
            "product_id": str(_extract(item, "product_id") or ""),
            "data_docid": str(_extract(item, "data_docid") or ""),
            "gid": str(_extract(item, "gid") or ""),
            "raw": item,
        })
    return candidates


def _fetch_product_info(candidate):
    identifier = candidate.get("product_id") or candidate.get("data_docid") or candidate.get("gid")
    if not identifier or not _has_dataforseo_credentials():
        return {}
    key = ("product-info", normalize_text(identifier))
    cached = _cache_get(_search_cache, key)
    if cached is not None:
        return cached
    task = {**_task_defaults(), "product_id": identifier}
    if candidate.get("data_docid"):
        task["data_docid"] = candidate["data_docid"]
    try:
        task_id = _post_task("/v3/merchant/google/product_info/task_post", task)
        results = _poll_task("/v3/merchant/google/product_info/task_get/advanced/{task_id}", task_id)
        payload = results[0] if results else {}
    except Exception:
        payload = {}
    _cache_set(_search_cache, key, payload)
    return payload


def _extract_offers(product_info, fallback_title=""):
    sellers = (product_info or {}).get("sellers") or (product_info or {}).get("items") or []
    offers = []
    for seller in sellers:
        url = str(_extract(seller, "url", "shop_ad_aclk", "link") or "").strip()
        price_obj = seller.get("price") or {}
        price = _extract_price(_extract(seller, "price") if not isinstance(price_obj, dict) else _extract(price_obj, "current", "current_price", "value"))
        if not url or price <= 0:
            continue
        offers.append({
            "retailer": str(_extract(seller, "seller", "title", "merchant") or _source_domain(url)).strip(),
            "title": str(_extract(seller, "title") or fallback_title).strip(),
            "price": price,
            "url": url,
            "shipping": str(_extract(seller, "delivery_info", "delivery", "shipping") or "").strip(),
            "is_best": bool(seller.get("is_best_match") or False),
        })
    offers.sort(key=lambda offer: (not offer["is_best"], offer["price"], offer["retailer"]))
    return offers


def _normalize_candidate(candidate, product_info=None):
    product_info = product_info or {}
    title = str((product_info or {}).get("title") or candidate.get("title") or "").strip()
    offers = _extract_offers(product_info, title)
    best_offer = offers[0] if offers else None
    product_url = (best_offer or {}).get("url") or candidate.get("shopping_url") or ""
    image = candidate.get("image") or _find_source_page_image(product_url)
    product_type = normalize_product_type(_infer_product_type(title))
    brand = candidate.get("brand") or _find_supported_brand(title)
    normalized = {
        "firestore_id": build_catalog_product_id({"brand": brand, "product_name": title, "type": product_type}),
        "brand": brand or "",
        "product_name": title,
        "category": product_type,
        "subcategory": product_type,
        "type": product_type,
        "price": (best_offer or {}).get("price") or candidate.get("price") or 0,
        "rating": float(candidate.get("rating") or 0),
        "image": image or "",
        "website": (best_offer or {}).get("retailer") or _source_domain(product_url) or "web",
        "title-href": product_url,
        "source": "dataforseo",
        "merchantOffers": [
            {
                "retailer": offer.get("retailer") or _source_domain(offer.get("url")),
                "title": offer.get("title") or title,
                "price": float(offer.get("price") or 0),
                "url": offer.get("url") or "",
                "shipping": offer.get("shipping") or "",
                "source": "dataforseo",
            }
            for offer in offers
            if offer.get("url") and offer.get("price")
        ],
        "merchantDomain": _source_domain(product_url),
        "raw": {
            "source": "dataforseo",
            "productUrl": product_url,
            "merchantOffers": offers,
            "product_id": candidate.get("product_id") or "",
            "data_docid": candidate.get("data_docid") or "",
            "gid": candidate.get("gid") or "",
            "candidate": candidate.get("raw") or {},
            "product_info": product_info or {},
        },
    }
    if not normalized["brand"] or not normalized["product_name"]:
        return None
    _web_product_cache[normalized["firestore_id"]] = normalized
    return normalized


def search_web_products(query, limit=12):
    normalized_query = normalize_text(query)
    if not normalized_query or not _has_dataforseo_credentials():
        return []
    key = ("web-search", normalized_query, limit)
    cached = _cache_get(_search_cache, key)
    if cached is not None:
        return cached
    brand = _find_supported_brand(query)
    try:
        results = _search_products_task(query, max(limit * 2, 12))
    except Exception:
        _cache_set(_search_cache, key, [])
        return []
    seen, normalized_products = set(), []
    for result in results:
        for candidate in _extract_candidates(result, brand):
            if brand:
                candidate_brand = _canonical_top_brand(candidate.get("brand")) or normalize_text(candidate.get("brand"))
                brand_key = _canonical_top_brand(brand) or normalize_text(brand)
                if candidate_brand != brand_key:
                    continue
            product = _normalize_candidate(candidate, {})
            if not product:
                continue
            dedupe_key = (normalize_text(product.get("brand")), normalize_text(product.get("product_name")))
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            normalized_products.append(product)
            if len(normalized_products) >= limit:
                _cache_set(_search_cache, key, normalized_products)
                return normalized_products
    _cache_set(_search_cache, key, normalized_products)
    return normalized_products


def _search_brand_catalog(brand, category_or_type="", limit=12, enrich_product_info=False):
    display_brand = _display_brand(brand)
    if not display_brand or not _has_dataforseo_credentials():
        return []
    query = f"{display_brand} {CATEGORY_SEARCH_TERMS.get(normalize_product_type(category_or_type), category_or_type or 'makeup')}".strip()
    key = ("brand-catalog", normalize_text(display_brand), normalize_product_type(category_or_type), limit, enrich_product_info)
    cached = _cache_get(_search_cache, key)
    if cached is not None:
        return cached
    try:
        results = _search_products_task(query, max(limit * 3, 18))
    except Exception:
        _cache_set(_search_cache, key, [])
        return []
    seen, normalized_products = set(), []
    brand_key = _canonical_top_brand(display_brand) or normalize_text(display_brand)
    for result in results:
        for candidate in _extract_candidates(result, display_brand):
            candidate_brand = _canonical_top_brand(candidate.get("brand")) or normalize_text(candidate.get("brand"))
            if brand_key and candidate_brand != brand_key:
                continue
            product = _normalize_candidate(candidate, _fetch_product_info(candidate) if enrich_product_info else {})
            if not product:
                continue
            if category_or_type and normalize_product_type(product.get("type")) != normalize_product_type(category_or_type):
                continue
            dedupe_key = (normalize_text(product.get("brand")), normalize_text(product.get("product_name")))
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            normalized_products.append(product)
            if len(normalized_products) >= limit:
                _cache_set(_search_cache, key, normalized_products)
                return normalized_products
    _cache_set(_search_cache, key, normalized_products)
    return normalized_products


def discover_live_category_products(category_or_type, limit=36):
    results, seen = [], set()
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(_search_brand_catalog, brand, category_or_type, min(4, limit), False): brand for brand in list(TOP_BRANDS.values())[:19]}
        for future in as_completed(futures):
            try:
                items = future.result()
            except Exception:
                continue
            for product in items:
                key = (normalize_text(product.get("brand")), normalize_text(product.get("product_name")))
                if key in seen:
                    continue
                seen.add(key)
                results.append(product)
                if len(results) >= limit:
                    return results[:limit]
    return results[:limit]


def find_live_dupe_candidates(brand, product_name, product_type="", category="", price=0, limit=18):
    target_type = normalize_product_type(product_type or category)
    if not target_type:
        return []
    results, seen = [], set()
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(_search_brand_catalog, candidate_brand, target_type, min(3, limit), False): candidate_brand for candidate_brand in TOP_BRANDS.values() if normalize_text(candidate_brand) != normalize_text(brand)}
        for future in as_completed(futures):
            try:
                items = future.result()
            except Exception:
                continue
            for product in items:
                key = (normalize_text(product.get("brand")), normalize_text(product.get("product_name")))
                if key in seen:
                    continue
                seen.add(key)
                results.append(product)
                if len(results) >= limit:
                    return results[:limit]
    return results[:limit]


def get_web_product_by_id(product_id):
    return _web_product_cache.get(product_id)


def find_price_matches(brand, product_name, limit=8):
    if not product_name or not _has_dataforseo_credentials():
        return []
    key = ("price-match", normalize_text(brand), normalize_text(product_name), limit)
    cached = _cache_get(_price_match_cache, key)
    if cached is not None:
        return cached
    offers, seen = [], set()
    for candidate in search_web_products(f"{brand} {product_name}".strip(), max(limit * 2, 8)):
        merchant_offers = candidate.get("merchantOffers") or candidate.get("raw", {}).get("merchantOffers") or _extract_offers(_fetch_product_info(candidate.get("raw", {})), candidate.get("product_name"))
        for index, offer in enumerate(merchant_offers):
            title, url, price = str(offer.get("title") or candidate.get("product_name") or "").strip(), str(offer.get("url") or "").strip(), _extract_price(offer.get("price"))
            confidence = title_match_confidence(title, brand, product_name)
            if not title or not url or price <= 0 or confidence < 45 or not is_live_product_url(url):
                continue
            dedupe_key = (normalize_text(offer.get("retailer")), normalize_text(title), round(price, 2))
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            digest = hashlib.sha1(f"{title}|{url}".encode("utf-8")).hexdigest()[:14]
            offers.append({"id": f"offer-{digest}", "retailer": offer.get("retailer") or _source_domain(url), "title": title, "price": price, "url": url, "image": candidate.get("image") or "", "shipping": offer.get("shipping") or "", "source": "dataforseo", "matchConfidence": confidence, "rank": index})
            if len(offers) >= limit:
                _cache_set(_price_match_cache, key, offers[:limit])
                return offers[:limit]
    _cache_set(_price_match_cache, key, offers[:limit])
    return offers[:limit]


def augment_firestore_catalog_with_top_brands(brands=None, categories=None, per_query_limit=12):
    selected_brands = brands or list(TOP_BRANDS.values())
    selected_categories = categories or DEFAULT_AUGMENT_CATEGORIES
    all_products, seen = [], set()
    for brand in selected_brands:
        for category in selected_categories:
            for product in _search_brand_catalog(brand, category, per_query_limit, True):
                key = (normalize_text(product.get("brand")), normalize_text(product.get("product_name")))
                if key in seen:
                    continue
                seen.add(key)
                all_products.append(product)
    return {"brands": len(selected_brands), "categories": len(selected_categories), "productsFound": len(all_products), "firestore": upsert_firestore_products(all_products)}


def get_dataforseo_status():
    return {
        "credentialsPresent": _has_dataforseo_credentials(),
        "baseUrl": DATAFORSEO_BASE_URL,
        "locationCode": DATAFORSEO_LOCATION_CODE,
        "languageCode": DATAFORSEO_LANGUAGE_CODE,
        "device": DATAFORSEO_DEVICE,
        "os": DATAFORSEO_OS,
        "topBrandCount": len(TOP_BRANDS),
        "defaultAugmentCategoryCount": len(DEFAULT_AUGMENT_CATEGORIES),
    }
