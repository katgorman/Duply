import base64
import hashlib
import html
import json
import os
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from firestore_products import (
    build_catalog_dedupe_key,
    build_catalog_product_id,
    get_firestore_web_cache,
    normalize_product_type,
    normalize_catalog_price,
    normalize_text,
    set_firestore_web_cache,
    upsert_firestore_products,
)

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
WEB_PRODUCT_INFO_CACHE_TTL_SECONDS = int(os.getenv("DUPLY_WEB_PRODUCT_INFO_CACHE_TTL_SECONDS", "86400"))
URL_STATUS_CACHE_TTL_SECONDS = int(os.getenv("DUPLY_URL_STATUS_CACHE_TTL_SECONDS", "21600"))
URL_CHECK_TIMEOUT_SECONDS = int(os.getenv("DUPLY_URL_CHECK_TIMEOUT_SECONDS", "5"))
CACHE_SCHEMA_VERSION = os.getenv("DUPLY_CACHE_SCHEMA_VERSION", "us-retailers-v3").strip() or "us-retailers-v3"
OFFICIAL_RETAILER_TIMEOUT_SECONDS = int(os.getenv("DUPLY_OFFICIAL_RETAILER_TIMEOUT_SECONDS", "12"))
OFFICIAL_RETAILER_MAX_WORKERS = int(os.getenv("DUPLY_OFFICIAL_RETAILER_MAX_WORKERS", "6"))

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
    "contour": "contour", "setting spray": "setting spray", "skin tint": "skin tint",
    "lip gloss": "lip gloss", "lip oil": "lip oil", "lip liner": "lip liner", "lip balm": "lip balm",
    "eyeshadow": "eyeshadow palette", "eyeliner": "eyeliner", "mascara": "mascara", "eyebrow": "brow makeup",
    "brow gel": "brow gel", "brow pencil": "brow pencil", "cleanser": "cleanser", "moisturizer": "moisturizer",
    "serum": "serum", "sunscreen": "sunscreen",
}
DEFAULT_AUGMENT_CATEGORIES = [
    "foundation", "skin tint", "concealer", "blush", "bronzer", "contour", "powder", "primer",
    "highlighter", "setting spray", "lipstick", "lip gloss", "lip oil", "lip liner", "lip balm",
    "eyeshadow", "eyeliner", "mascara", "eyebrow", "brow gel", "brow pencil",
    "cleanser", "moisturizer", "serum", "sunscreen",
]

CATEGORY_QUERY_VARIANTS = {
    "foundation": ["foundation", "liquid foundation", "powder foundation"],
    "skin tint": ["skin tint", "tinted moisturizer", "skin tint serum"],
    "concealer": ["concealer", "liquid concealer", "concealer stick"],
    "blush": ["blush", "liquid blush", "powder blush", "cream blush"],
    "bronzer": ["bronzer", "cream bronzer", "powder bronzer"],
    "contour": ["contour", "contour stick", "contour wand"],
    "powder": ["powder", "setting powder", "pressed powder"],
    "primer": ["primer", "face primer", "gripping primer"],
    "highlighter": ["highlighter", "liquid highlighter", "powder highlighter"],
    "setting spray": ["setting spray", "makeup setting spray", "fixing spray"],
    "lipstick": ["lipstick", "matte lipstick", "satin lipstick"],
    "lip gloss": ["lip gloss", "plumping lip gloss"],
    "lip oil": ["lip oil", "tinted lip oil"],
    "lip liner": ["lip liner", "lip pencil"],
    "lip balm": ["lip balm", "tinted lip balm"],
    "eyeshadow": ["eyeshadow", "eyeshadow palette", "cream eyeshadow"],
    "eyeliner": ["eyeliner", "liquid eyeliner", "gel eyeliner"],
    "mascara": ["mascara", "volumizing mascara", "lengthening mascara"],
    "eyebrow": ["brow makeup", "eyebrow product", "brow kit"],
    "brow gel": ["brow gel", "eyebrow gel"],
    "brow pencil": ["brow pencil", "eyebrow pencil"],
    "cleanser": ["cleanser", "face cleanser"],
    "moisturizer": ["moisturizer", "face moisturizer", "cream moisturizer"],
    "serum": ["serum", "face serum"],
    "sunscreen": ["sunscreen", "face sunscreen", "spf"],
}

_allowed_brands = None
_search_cache, _image_cache, _web_product_cache, _price_match_cache, _url_status_cache = {}, {}, {}, {}, {}
NON_US_COUNTRY_TLDS = {
    ".ae", ".au", ".be", ".br", ".ca", ".ch", ".cn", ".de", ".dk", ".es",
    ".eu", ".fr", ".hk", ".ie", ".in", ".it", ".jp", ".kr", ".mx", ".nl",
    ".no", ".nz", ".pl", ".se", ".sg", ".tr", ".tw", ".uk", ".vn", ".za",
}
GENERIC_RETAILER_TLDS = {
    ".com", ".us", ".net", ".org", ".shop", ".store", ".beauty", ".makeup", ".cosmetics", ".co",
}
OFFICIAL_US_RETAILERS = {
    "sephora": {
        "displayName": "Sephora",
        "sitemaps": ["https://www.sephora.com/sitemaps/products-sitemap.xml"],
        "productUrlPattern": r"^https://www\.sephora\.com/product/[^?#]+$",
        "siteSuffixes": ["| Sephora", " | Sephora", "- Sephora"],
    },
    "ulta": {
        "displayName": "Ulta Beauty",
        "sitemaps": ["https://www.ulta.com/sitemap/p.xml"],
        "productUrlPattern": r"^https://www\.ulta\.com/p/[^?#]+(?:\?sku=\d+)?$",
        "siteSuffixes": ["| Ulta Beauty", " | Ulta Beauty", "- Ulta Beauty"],
    },
}


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


def _versioned_key(*parts):
    return (CACHE_SCHEMA_VERSION, *parts)


def _restore_cached_products(products):
    restored = []
    for product in products or []:
        if not isinstance(product, dict):
            continue
        normalized = {
            **product,
            "firestore_id": product.get("firestore_id") or product.get("id") or build_catalog_product_id(product),
        }
        _web_product_cache[normalized["firestore_id"]] = normalized
        restored.append(normalized)
    return restored


def _load_persistent_cache(cache, cache_kind, cache_key, max_age_seconds=WEB_SEARCH_CACHE_TTL_SECONDS):
    cached = _cache_get(cache, cache_key)
    if cached is not None:
        return cached

    payload = get_firestore_web_cache(cache_kind, json.dumps(cache_key, sort_keys=True), max_age_seconds)
    if payload is None:
        return None

    value = payload.get("items") if isinstance(payload, dict) and "items" in payload else payload
    if cache_kind in {"web-search", "brand-catalog"}:
        value = _restore_cached_products(value)
    elif cache_kind == "price-match":
        value = list(value or [])

    _cache_set(cache, cache_key, value)
    return value


def _save_persistent_cache(cache, cache_kind, cache_key, value):
    _cache_set(cache, cache_key, value)
    payload = {"items": value} if cache_kind in {"web-search", "brand-catalog", "price-match"} else value
    set_firestore_web_cache(cache_kind, json.dumps(cache_key, sort_keys=True), payload)


def _upsert_cached_products(products):
    if not products:
        return
    try:
        upsert_firestore_products(products)
    except Exception:
        pass


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


def _fetch_text_url(url, timeout=OFFICIAL_RETAILER_TIMEOUT_SECONDS, headers=None):
    request_headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Duply/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    if headers:
        request_headers.update(headers)

    request = Request(url, headers=request_headers)
    with urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="ignore"), response.geturl()


def _source_domain(url):
    match = re.search(r"https?://(?:www\.)?([^/?#]+)", str(url or ""), flags=re.IGNORECASE)
    return match.group(1).lower() if match else ""


def _is_us_domain(domain):
    domain = normalize_text(domain)
    if not domain:
        return False

    if any(domain.endswith(tld) for tld in NON_US_COUNTRY_TLDS):
        return False

    return any(domain.endswith(tld) for tld in GENERIC_RETAILER_TLDS)


def is_approved_retailer_url(url):
    url = str(url or "").strip()
    domain = _source_domain(url)
    return url.startswith(("http://", "https://")) and "." in domain and _is_us_domain(domain)


def _clean_product_title(title, retailer=""):
    cleaned = html.unescape(str(title or "").strip())
    for suffix in (OFFICIAL_US_RETAILERS.get(normalize_text(retailer), {}) or {}).get("siteSuffixes", []):
        if cleaned.endswith(suffix):
            cleaned = cleaned[: -len(suffix)].strip()
    return cleaned.strip(" -|")


def _strip_brand_from_title(title, brand):
    cleaned_title = html.unescape(str(title or "").strip())
    clean_brand = html.unescape(str(brand or "").strip())
    if not cleaned_title or not clean_brand:
        return cleaned_title

    patterns = [
        rf"\s+-\s+{re.escape(clean_brand)}$",
        rf"\s+\|\s+{re.escape(clean_brand)}$",
        rf"\s+:\s+{re.escape(clean_brand)}$",
        rf"^{re.escape(clean_brand)}\s+-\s+",
        rf"^{re.escape(clean_brand)}\s+\|\s+",
        rf"^{re.escape(clean_brand)}\s+:\s+",
        rf"^{re.escape(clean_brand)}\s+by\s+",
        rf"\s+by\s+{re.escape(clean_brand)}$",
    ]

    stripped = cleaned_title
    for pattern in patterns:
        stripped = re.sub(pattern, "", stripped, flags=re.IGNORECASE).strip()

    return stripped or cleaned_title


def _normalize_retailer_name(value):
    normalized = normalize_text(value)
    if normalized in OFFICIAL_US_RETAILERS:
        return normalized
    for key, config in OFFICIAL_US_RETAILERS.items():
        if normalize_text(config.get("displayName")) == normalized:
            return key
    return normalized


def _normalize_brand_value(value):
    if isinstance(value, dict):
        for key in ("name", "brand", "title"):
            nested = _normalize_brand_value(value.get(key))
            if nested:
                return nested
        return ""
    if isinstance(value, list):
        for item in value:
            nested = _normalize_brand_value(item)
            if nested:
                return nested
        return ""
    brand = html.unescape(str(value or "").strip())
    brand = re.sub(r"\s+", " ", brand)
    return brand.strip(" -|")


def _is_merchandise_product_title(title, url=""):
    text = normalize_text(title)
    page_url = normalize_text(url)
    blocked_markers = [
        "gift with purchase",
        "free gift",
        "free ",
        "sample pack",
        "gwp",
    ]
    if any(marker in text for marker in blocked_markers):
        return False
    if "/gwp" in page_url:
        return False
    return True


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
    if not SOURCE_IMAGE_LOOKUP_ENABLED or not product_url or not is_approved_retailer_url(product_url):
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
        return normalize_catalog_price(raw_value)
    match = re.search(r"(\d+(?:\.\d{1,2})?)", str(raw_value).replace(",", ""))
    return normalize_catalog_price(match.group(1)) if match else 0


def _infer_product_type(text):
    normalized = normalize_text(text)
    for needle, product_type in CATEGORY_SEARCH_TERMS.items():
        if needle in normalized or normalize_text(product_type) in normalized:
            return normalize_product_type(needle)
    return ""


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
    raw = candidate.get("raw") if isinstance(candidate, dict) else {}
    identifier = (
        candidate.get("product_id")
        or candidate.get("data_docid")
        or candidate.get("gid")
        or (raw or {}).get("product_id")
        or (raw or {}).get("data_docid")
        or (raw or {}).get("gid")
    )
    if not identifier or not _has_dataforseo_credentials():
        return {}
    key = _versioned_key("product-info", normalize_text(identifier))
    cached = _cache_get(_search_cache, key)
    if cached is not None:
        return cached
    persistent = get_firestore_web_cache("product-info", identifier, WEB_PRODUCT_INFO_CACHE_TTL_SECONDS)
    if persistent is not None:
        _cache_set(_search_cache, key, persistent)
        return persistent
    task = {**_task_defaults(), "product_id": identifier}
    data_docid = candidate.get("data_docid") or (raw or {}).get("data_docid")
    if data_docid:
        task["data_docid"] = data_docid
    try:
        task_id = _post_task("/v3/merchant/google/product_info/task_post", task)
        results = _poll_task("/v3/merchant/google/product_info/task_get/advanced/{task_id}", task_id)
        payload = results[0] if results else {}
    except Exception:
        payload = {}
    _cache_set(_search_cache, key, payload)
    if payload:
        set_firestore_web_cache("product-info", identifier, payload)
    return payload


def _extract_offers(product_info, fallback_title=""):
    def walk_items(node):
        if isinstance(node, dict):
            yield node
            nested = node.get("items")
            if isinstance(nested, list):
                for child in nested:
                    yield from walk_items(child)
            sellers = node.get("sellers")
            if isinstance(sellers, list):
                for seller in sellers:
                    yield seller
        elif isinstance(node, list):
            for child in node:
                yield from walk_items(child)

    offers = []
    for seller in walk_items(product_info or {}):
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


def _extract_product_info_title(product_info, fallback_title=""):
    def walk_items(node):
        if isinstance(node, dict):
            yield node
            nested = node.get("items")
            if isinstance(nested, list):
                for child in nested:
                    yield from walk_items(child)
        elif isinstance(node, list):
            for child in node:
                yield from walk_items(child)

    for item in walk_items(product_info or {}):
        title = str(_extract(item, "title", "name") or "").strip()
        if title:
            return title
    return fallback_title


def _extract_meta_content(page_html, property_name):
    patterns = [
        rf'<meta[^>]+property=["\']{re.escape(property_name)}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+name=["\']{re.escape(property_name)}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']{re.escape(property_name)}["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']{re.escape(property_name)}["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, page_html, flags=re.IGNORECASE)
        if match:
            return html.unescape(match.group(1).replace("\\/", "/").strip())
    return ""


def _extract_embedded_page_price(page_html):
    patterns = [
        r'data-cnstrc-item-price=["\']\$?([0-9]+(?:\.[0-9]{1,2})?)["\']',
        r'"currentSku"\s*:\s*\{.*?"listPrice"\s*:\s*"\$?([0-9]+(?:\.[0-9]{1,2})?)"',
        r'"listPrice"\s*:\s*"\$?([0-9]+(?:\.[0-9]{1,2})?)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, page_html, flags=re.IGNORECASE | re.DOTALL)
        if not match:
            continue
        price = _extract_price(match.group(1))
        if price > 0:
            return price
    return 0


def _extract_json_ld_objects(page_html):
    objects = []
    for match in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', page_html, flags=re.IGNORECASE | re.DOTALL):
        raw = match.group(1).strip()
        if not raw:
            continue
        try:
            parsed = json.loads(raw)
        except Exception:
            continue
        if isinstance(parsed, list):
            objects.extend(item for item in parsed if isinstance(item, dict))
        elif isinstance(parsed, dict):
            objects.append(parsed)
    return objects


def _flatten_json_ld_product_candidates(objects):
    for item in objects:
        if not isinstance(item, dict):
            continue
        if normalize_text(item.get("@type")) == "product":
            yield item
        graph = item.get("@graph")
        if isinstance(graph, list):
            for child in graph:
                if isinstance(child, dict) and normalize_text(child.get("@type")) == "product":
                    yield child


def _extract_breadcrumb_category(page_html):
    for item in _extract_json_ld_objects(page_html):
        if normalize_text(item.get("@type")) != "breadcrumblist":
            continue
        breadcrumb_items = item.get("itemListElement") or []
        names = []
        for breadcrumb in breadcrumb_items:
            entry = breadcrumb.get("item") if isinstance(breadcrumb, dict) else None
            if isinstance(entry, dict):
                name = entry.get("name")
            else:
                name = None
            if name:
                names.append(str(name).strip())
        if names:
            return names[-1]
    return ""


def _extract_brand_from_page(page_html, product_data, title="", retailer=""):
    candidates = [
        product_data.get("brand") if isinstance(product_data, dict) else "",
        product_data.get("manufacturer") if isinstance(product_data, dict) else "",
        _extract_meta_content(page_html, "product:brand"),
        _extract_meta_content(page_html, "og:brand"),
        _extract_meta_content(page_html, "twitter:label1") if "brand" in normalize_text(_extract_meta_content(page_html, "twitter:label1")) else "",
        _extract_meta_content(page_html, "twitter:data1") if not _extract_price(_extract_meta_content(page_html, "twitter:data1")) else "",
    ]
    for candidate in candidates:
        brand = _normalize_brand_value(candidate)
        if brand:
            return brand

    cleaned_title = _clean_product_title(title, retailer)
    supported_brand = _find_supported_brand(cleaned_title)
    if supported_brand:
        return supported_brand

    title_separators = [" by ", " - ", " | ", ":"]
    normalized_title = html.unescape(str(cleaned_title or "").strip())
    for separator in title_separators:
        if separator in normalized_title.lower():
            parts = re.split(re.escape(separator), normalized_title, maxsplit=1, flags=re.IGNORECASE)
            if len(parts) == 2:
                candidates = [
                    _normalize_brand_value(parts[0]),
                    _normalize_brand_value(parts[1]),
                ]
                for candidate in candidates:
                    supported_candidate = _find_supported_brand(candidate)
                    if supported_candidate:
                        return supported_candidate
                for candidate in sorted(
                    [candidate for candidate in candidates if candidate],
                    key=lambda value: (len(value.split()) > 5, len(value.split()), len(value)),
                ):
                    if len(candidate.split()) <= 5:
                        return candidate
    return ""


def _normalize_availability_status(value):
    status = normalize_text(value)
    if not status:
        return "active"
    status = status.rsplit("/", 1)[-1]
    status = status.replace("_", " ").replace("-", " ").strip()
    return status or "active"


def _is_available_status(value):
    status = _normalize_availability_status(value)
    blocked = {
        "discontinued",
        "out of stock",
        "outofstock",
        "sold out",
        "soldout",
        "unavailable",
        "offline only",
        "not available",
        "backorder",
        "preorder",
        "pre order",
    }
    return status not in blocked


def _normalize_official_offer(url, retailer, title, price, availability_status, image=""):
    clean_url = str(url or "").strip()
    clean_price = _extract_price(price)
    normalized_status = _normalize_availability_status(availability_status)
    if not clean_url or not is_approved_retailer_url(clean_url):
        return None
    return {
        "id": f"offer-{hashlib.sha1(clean_url.encode('utf-8')).hexdigest()[:14]}",
        "retailer": retailer,
        "title": title,
        "price": clean_price,
        "url": clean_url,
        "image": image or "",
        "shipping": normalized_status,
        "source": normalize_text(retailer),
        "matchConfidence": 100,
    }


def _parse_official_retailer_product_page(url, retailer):
    retailer_key = _normalize_retailer_name(retailer)
    config = OFFICIAL_US_RETAILERS.get(retailer_key) or {}
    try:
        page_html, final_url = _fetch_text_url(url)
    except Exception:
        return None

    if not is_approved_retailer_url(final_url) or _looks_like_missing_page(page_html, final_url):
        return None

    product_objects = list(_flatten_json_ld_product_candidates(_extract_json_ld_objects(page_html)))
    product_data = product_objects[0] if product_objects else {}
    offers = product_data.get("offers") or {}
    if isinstance(offers, list):
        offers = offers[0] if offers else {}

    title = (
        product_data.get("name")
        or _extract_meta_content(page_html, "og:title")
        or Path(urlparse(final_url).path).name.replace("-", " ")
    )
    title = _clean_product_title(title, retailer_key)
    if not _is_merchandise_product_title(title, final_url):
        return None
    brand = _extract_brand_from_page(page_html, product_data, title=title, retailer=retailer_key)
    title = _strip_brand_from_title(title, brand)
    image = (
        product_data.get("image")
        or _extract_meta_content(page_html, "og:image")
        or ""
    )
    if isinstance(image, list):
        image = image[0] if image else ""
    image = image or _find_source_page_image(final_url)
    price = (
        offers.get("price")
        or _extract_meta_content(page_html, "product:price:amount")
        or _extract_meta_content(page_html, "twitter:data1")
    )
    rating = 0
    review_count = 0
    aggregate_rating = product_data.get("aggregateRating") or {}
    if isinstance(aggregate_rating, dict):
        rating = float(aggregate_rating.get("ratingValue") or 0)
        review_count = int(float(aggregate_rating.get("reviewCount") or 0))
    availability = str(offers.get("availability") or product_data.get("availability") or "").strip()
    availability_status = _normalize_availability_status(availability)
    category = _extract_breadcrumb_category(page_html)
    product_type = normalize_product_type(
        _infer_product_type(category) or _infer_product_type(title) or category or "general"
    )
    clean_price = _extract_price(price)
    if clean_price <= 0:
        clean_price = _extract_embedded_page_price(page_html)
    official_offer = _normalize_official_offer(
        offers.get("url") or final_url,
        config.get("displayName") or retailer,
        title,
        clean_price,
        availability_status,
        image=image,
    )

    if not official_offer and brand and title:
        official_offer = {
            "id": f"offer-{hashlib.sha1((final_url or url).encode('utf-8')).hexdigest()[:14]}",
            "retailer": config.get("displayName") or retailer,
            "title": title,
            "price": clean_price,
            "url": final_url,
            "image": image or "",
            "shipping": availability_status,
            "source": retailer_key,
            "matchConfidence": 100,
        }

    if not brand or not title or not official_offer:
        return None

    return {
        "firestore_id": build_catalog_product_id({"brand": brand, "product_name": title, "type": product_type}),
        "brand": brand,
        "product_name": title,
        "category": product_type,
        "subcategory": product_type,
        "type": product_type,
        "price": clean_price,
        "rating": rating,
        "image": image or "",
        "website": config.get("displayName") or retailer,
        "title-href": official_offer["url"],
        "source": retailer_key,
        "availabilityStatus": availability_status,
        "merchantOffers": [official_offer],
        "merchantDomain": _source_domain(official_offer["url"]),
        "raw": {
            "source": retailer_key,
            "productUrl": official_offer["url"],
            "merchantOffers": [official_offer],
            "availabilityStatus": availability_status,
            "category": category,
            "retailerBrand": brand,
        },
        "numberOfReviews": review_count,
    }


def _collect_sitemap_product_urls(sitemap_urls, product_url_pattern, max_urls=0, force_refresh=False):
    cache_key = {
        "sitemaps": list(sitemap_urls or []),
        "pattern": product_url_pattern,
    }
    if not force_refresh:
        cached = get_firestore_web_cache("official-retailer-sitemap-urls", json.dumps(cache_key, sort_keys=True), WEB_IMAGE_CACHE_TTL_SECONDS)
        if isinstance(cached, list) and cached:
            return cached[:max_urls] if max_urls else cached

    queue = list(sitemap_urls or [])
    visited = set()
    product_urls = []
    pattern = re.compile(product_url_pattern, flags=re.IGNORECASE)

    while queue:
        sitemap_url = queue.pop(0)
        if sitemap_url in visited:
            continue
        visited.add(sitemap_url)

        try:
            xml_text, _ = _fetch_text_url(sitemap_url)
            root = ET.fromstring(xml_text)
        except Exception:
            continue

        namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        sitemap_nodes = root.findall("sm:sitemap", namespace) or root.findall("sitemap")
        if sitemap_nodes:
            for node in sitemap_nodes:
                loc = node.findtext("sm:loc", default="", namespaces=namespace) or node.findtext("loc", default="")
                loc = str(loc or "").strip()
                if loc and loc not in visited:
                    queue.append(loc)
            continue

        url_nodes = root.findall("sm:url", namespace) or root.findall("url")
        for node in url_nodes:
            loc = node.findtext("sm:loc", default="", namespaces=namespace) or node.findtext("loc", default="")
            loc = str(loc or "").strip()
            if not loc or not pattern.match(loc):
                continue
            product_urls.append(loc)
            if max_urls and len(product_urls) >= max_urls:
                set_firestore_web_cache("official-retailer-sitemap-urls", json.dumps(cache_key, sort_keys=True), product_urls)
                return product_urls

    if product_urls:
        set_firestore_web_cache("official-retailer-sitemap-urls", json.dumps(cache_key, sort_keys=True), product_urls)
    return product_urls


def _normalize_candidate(candidate, product_info=None):
    product_info = product_info or {}
    title = _extract_product_info_title(product_info, str(candidate.get("title") or "").strip())
    offers = [
        offer for offer in _extract_offers(product_info, title)
        if is_approved_retailer_url(offer.get("url"))
    ]
    best_offer = offers[0] if offers else None
    candidate_url = str(candidate.get("shopping_url") or "").strip()
    if candidate_url and not is_approved_retailer_url(candidate_url):
        candidate_url = ""
    product_url = (best_offer or {}).get("url") or candidate_url or ""
    image = candidate.get("image") or _find_source_page_image(product_url)
    product_type = normalize_product_type(_infer_product_type(title) or "general")
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
    key = _versioned_key("web-search", normalized_query, limit)
    cached = _load_persistent_cache(_search_cache, "web-search", key)
    if cached is not None:
        return cached
    brand = _find_supported_brand(query)
    try:
        results = _search_products_task(query, max(limit * 2, 12))
    except Exception:
        _save_persistent_cache(_search_cache, "web-search", key, [])
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
            dedupe_key = build_catalog_dedupe_key(product)
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            normalized_products.append(product)
            if len(normalized_products) >= limit:
                _upsert_cached_products(normalized_products)
                _save_persistent_cache(_search_cache, "web-search", key, normalized_products)
                return normalized_products
    _upsert_cached_products(normalized_products)
    _save_persistent_cache(_search_cache, "web-search", key, normalized_products)
    return normalized_products


def _search_brand_catalog(brand, category_or_type="", limit=12, enrich_product_info=False, search_term_override=""):
    display_brand = _display_brand(brand)
    if not display_brand or not _has_dataforseo_credentials():
        return []
    query_term = (search_term_override or "").strip() or CATEGORY_SEARCH_TERMS.get(normalize_product_type(category_or_type), category_or_type or "makeup")
    query = f"{display_brand} {query_term}".strip()
    key = _versioned_key("brand-catalog", normalize_text(display_brand), normalize_product_type(category_or_type), normalize_text(query_term), limit, enrich_product_info)
    cached = _load_persistent_cache(_search_cache, "brand-catalog", key)
    if cached is not None:
        return cached
    try:
        results = _search_products_task(query, max(limit * 3, 18))
    except Exception:
        _save_persistent_cache(_search_cache, "brand-catalog", key, [])
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
            # Validity requirement is brand + live purchasability, not exact category parsing.
            # We still query by category terms, but we don't discard products for title-based
            # misclassification after the provider returns them.
            live_offer_urls = [
                offer.get("url")
                for offer in product.get("merchantOffers") or []
                if offer.get("url")
            ]
            if not live_offer_urls and not product.get("title-href"):
                continue
            dedupe_key = build_catalog_dedupe_key(product)
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            normalized_products.append(product)
            if len(normalized_products) >= limit:
                _upsert_cached_products(normalized_products)
                _save_persistent_cache(_search_cache, "brand-catalog", key, normalized_products)
                return normalized_products
    _upsert_cached_products(normalized_products)
    _save_persistent_cache(_search_cache, "brand-catalog", key, normalized_products)
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
                key = build_catalog_dedupe_key(product)
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
                key = build_catalog_dedupe_key(product)
                if key in seen:
                    continue
                seen.add(key)
                results.append(product)
                if len(results) >= limit:
                    return results[:limit]
    return results[:limit]


def get_web_product_by_id(product_id):
    return _web_product_cache.get(product_id)


def _candidate_direct_offer(candidate, brand, product_name):
    title = str(candidate.get("product_name") or candidate.get("title") or "").strip()
    url = str(candidate.get("title-href") or candidate.get("shopping_url") or candidate.get("raw", {}).get("productUrl") or "").strip()
    price = _extract_price(candidate.get("price"))
    confidence = title_match_confidence(title or product_name, brand, product_name)
    if not title or not url or price <= 0 or confidence < 35 or not is_live_product_url(url):
        return None
    digest = hashlib.sha1(f"{title}|{url}".encode("utf-8")).hexdigest()[:14]
    return {
        "id": f"offer-{digest}",
        "retailer": candidate.get("website") or _source_domain(url),
        "title": title,
        "price": price,
        "url": url,
        "image": candidate.get("image") or "",
        "shipping": "",
        "source": candidate.get("source") or "dataforseo",
        "matchConfidence": confidence,
        "rank": 999,
    }


def _query_variants(brand, product_name):
    variants = []
    seen = set()
    for value in [
        f"{brand} {product_name}".strip(),
        product_name.strip(),
        f"{brand} {product_name} makeup".strip(),
        f"{brand} {product_name} cosmetics".strip(),
    ]:
        normalized = normalize_text(value)
        if normalized and normalized not in seen:
            seen.add(normalized)
            variants.append(value)
    return variants


def find_price_matches(brand, product_name, product_url="", limit=8):
    if not product_name or not _has_dataforseo_credentials():
        return []
    key = _versioned_key("price-match", normalize_text(brand), normalize_text(product_name), normalize_text(product_url), limit)
    cached = _load_persistent_cache(_price_match_cache, "price-match", key)
    if cached is not None:
        return cached
    offers, seen = [], set()

    if product_url and is_live_product_url(product_url):
        direct_digest = hashlib.sha1(f"{brand}|{product_name}|{product_url}".encode("utf-8")).hexdigest()[:14]
        offers.append({
            "id": f"offer-{direct_digest}",
            "retailer": _source_domain(product_url),
            "title": f"{brand} {product_name}".strip(),
            "price": 0,
            "url": product_url,
            "image": "",
            "shipping": "",
            "source": "product-url",
            "matchConfidence": 100,
            "rank": 0,
        })

    for query in _query_variants(brand, product_name):
        for candidate in search_web_products(query, max(limit * 4, 12)):
            product_info = _fetch_product_info(candidate)
            merchant_offers = candidate.get("merchantOffers") or candidate.get("raw", {}).get("merchantOffers") or _extract_offers(product_info, candidate.get("product_name"))
            for index, offer in enumerate(merchant_offers):
                title, url, price = str(offer.get("title") or candidate.get("product_name") or "").strip(), str(offer.get("url") or "").strip(), _extract_price(offer.get("price"))
                confidence = title_match_confidence(title, brand, product_name)
                if not title or not url or price <= 0 or confidence < 35 or not is_live_product_url(url):
                    continue
                dedupe_key = (normalize_text(offer.get("retailer")), normalize_text(title), normalize_text(url))
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                digest = hashlib.sha1(f"{title}|{url}".encode("utf-8")).hexdigest()[:14]
                offers.append({"id": f"offer-{digest}", "retailer": offer.get("retailer") or _source_domain(url), "title": title, "price": price, "url": url, "image": candidate.get("image") or "", "shipping": offer.get("shipping") or "", "source": "dataforseo", "matchConfidence": confidence, "rank": index})
                if len([offer for offer in offers if offer.get("price", 0) > 0]) >= limit:
                    break

            direct_offer = _candidate_direct_offer(candidate, brand, product_name)
            if direct_offer:
                dedupe_key = (normalize_text(direct_offer.get("retailer")), normalize_text(direct_offer.get("title")), normalize_text(direct_offer.get("url")))
                if dedupe_key not in seen:
                    seen.add(dedupe_key)
                    offers.append(direct_offer)

        if len([offer for offer in offers if offer.get("price", 0) > 0]) >= limit:
            break

    deduped = []
    final_seen = set()
    for offer in offers:
        title, url, price = str(offer.get("title") or "").strip(), str(offer.get("url") or "").strip(), _extract_price(offer.get("price"))
        confidence = title_match_confidence(title or product_name, brand, product_name)
        if not title or not url or confidence < 35 or not is_live_product_url(url):
            continue
        dedupe_key = (normalize_text(offer.get("retailer")), normalize_text(title), normalize_text(url))
        if dedupe_key in final_seen:
            continue
        final_seen.add(dedupe_key)
        normalized_offer = {
            **offer,
            "price": price,
            "matchConfidence": confidence,
        }
        deduped.append(normalized_offer)

    deduped.sort(
        key=lambda offer: (
            offer.get("price", 0) <= 0,
            offer.get("price", 0) if offer.get("price", 0) > 0 else 10**9,
            -(offer.get("matchConfidence") or 0),
            normalize_text(offer.get("retailer")),
        )
    )

    final_offers = deduped[:limit]
    _save_persistent_cache(_price_match_cache, "price-match", key, final_offers)
    return final_offers


def _brand_seed_queries(brand, categories):
    queries = [(brand, "", "makeup")]
    seen = {("","makeup")}

    for category in categories or []:
        normalized_category = normalize_text(category)
        variants = CATEGORY_QUERY_VARIANTS.get(normalized_category, [category])
        for variant in variants:
            dedupe_key = (normalized_category, normalize_text(variant))
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            queries.append((brand, category, variant))

    return queries


def augment_official_us_retailers(retailers=None, max_urls_per_retailer=0, start_index=0):
    selected_retailers = [
        _normalize_retailer_name(retailer)
        for retailer in (retailers or list(OFFICIAL_US_RETAILERS.keys()))
        if _normalize_retailer_name(retailer) in OFFICIAL_US_RETAILERS
    ]
    results_summary = []
    all_products = []
    seen = set()
    duplicate_count = 0

    for retailer in selected_retailers:
        config = OFFICIAL_US_RETAILERS[retailer]
        sitemap_urls = _collect_sitemap_product_urls(
            config.get("sitemaps"),
            config.get("productUrlPattern"),
            0,
            force_refresh=start_index == 0,
        )
        scoped_urls = sitemap_urls[start_index:]
        if max_urls_per_retailer:
            scoped_urls = scoped_urls[:max_urls_per_retailer]

        retailer_products = []
        with ThreadPoolExecutor(max_workers=max(1, OFFICIAL_RETAILER_MAX_WORKERS)) as executor:
            futures = {
                executor.submit(_parse_official_retailer_product_page, url, retailer): url
                for url in scoped_urls
            }
            for future in as_completed(futures):
                try:
                    product = future.result()
                except Exception:
                    product = None
                if not product:
                    continue
                key = build_catalog_dedupe_key(product)
                if key in seen:
                    duplicate_count += 1
                    continue
                seen.add(key)
                retailer_products.append(product)
                all_products.append(product)

        results_summary.append({
            "retailer": retailer,
            "displayName": config.get("displayName"),
            "urlsDiscovered": len(sitemap_urls),
            "urlsProcessed": len(scoped_urls),
            "productsParsed": len(retailer_products),
            "startIndex": start_index,
            "nextStartIndex": start_index + len(scoped_urls),
        })

    return {
        "retailers": results_summary,
        "productsFound": len(all_products),
        "duplicatesSkipped": duplicate_count,
        "firestore": upsert_firestore_products(all_products),
    }


def augment_firestore_catalog_with_top_brands(brands=None, categories=None, per_query_limit=12):
    selected_brands = brands or list(TOP_BRANDS.values())
    selected_categories = categories or DEFAULT_AUGMENT_CATEGORIES
    all_products, seen = [], set()
    query_total = 0

    for brand in selected_brands:
        for _, category, query_term in _brand_seed_queries(brand, selected_categories):
            query_total += 1
            for product in _search_brand_catalog(
                brand,
                category,
                per_query_limit,
                True,
                search_term_override=query_term,
            ):
                key = build_catalog_dedupe_key(product)
                if key in seen:
                    continue
                seen.add(key)
                all_products.append(product)

    return {
        "brands": len(selected_brands),
        "categories": len(selected_categories),
        "queriesRun": query_total,
        "productsFound": len(all_products),
        "firestore": upsert_firestore_products(all_products),
    }


def augment_firestore_catalog_with_top_brands_slice(
    brands=None,
    categories=None,
    per_query_limit=12,
    start_query_index=0,
    max_queries=10,
):
    selected_brands = brands or list(TOP_BRANDS.values())
    selected_categories = categories or DEFAULT_AUGMENT_CATEGORIES
    planned_queries = []

    for brand in selected_brands:
        for _, category, query_term in _brand_seed_queries(brand, selected_categories):
            planned_queries.append({
                "brand": brand,
                "category": category,
                "queryTerm": query_term,
            })

    safe_start = max(0, int(start_query_index or 0))
    safe_max_queries = max(1, int(max_queries or 1))
    scoped_queries = planned_queries[safe_start:safe_start + safe_max_queries]

    all_products = []
    seen = set()
    for planned_query in scoped_queries:
        for product in _search_brand_catalog(
            planned_query["brand"],
            planned_query["category"],
            per_query_limit,
            True,
            search_term_override=planned_query["queryTerm"],
        ):
            key = build_catalog_dedupe_key(product)
            if key in seen:
                continue
            seen.add(key)
            all_products.append(product)

    next_query_index = safe_start + len(scoped_queries)
    return {
        "brands": len(selected_brands),
        "categories": len(selected_categories),
        "queriesRun": len(scoped_queries),
        "totalQueries": len(planned_queries),
        "startQueryIndex": safe_start,
        "nextQueryIndex": next_query_index,
        "finished": next_query_index >= len(planned_queries),
        "productsFound": len(all_products),
        "queries": scoped_queries,
        "firestore": upsert_firestore_products(all_products),
    }


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
        "officialRetailerCount": len(OFFICIAL_US_RETAILERS),
        "cacheSchemaVersion": CACHE_SCHEMA_VERSION,
    }
