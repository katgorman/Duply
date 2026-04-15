import hashlib
import html
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlencode
from urllib.request import Request, urlopen

from firestore_products import normalize_product_type, normalize_text

BASE_DIR = Path(__file__).resolve().parent
METADATA_PATH = BASE_DIR / "cosmetics_metadata.json"

WEB_SEARCH_ENABLED = os.getenv("DUPLY_WEB_SEARCH_ENABLED", "false").strip().lower() in {"1", "true", "yes"}
SERPAPI_API_KEY = os.getenv("SERPAPI_API_KEY", "").strip()
WEB_SEARCH_CACHE_TTL_SECONDS = int(os.getenv("DUPLY_WEB_SEARCH_CACHE_TTL_SECONDS", "3600"))
WEB_SEARCH_MAX_RESULTS = int(os.getenv("DUPLY_WEB_SEARCH_MAX_RESULTS", "8"))
WEB_SEARCH_YEARS = [year.strip() for year in os.getenv("DUPLY_WEB_SEARCH_YEARS", "2025,2026").split(",") if year.strip()]
WEB_SEARCH_REQUIRE_RELEASE_YEAR = os.getenv("DUPLY_WEB_SEARCH_REQUIRE_RELEASE_YEAR", "false").strip().lower() in {"1", "true", "yes"}
WEB_IMAGE_LOOKUP_ENABLED = os.getenv("DUPLY_WEB_IMAGE_LOOKUP_ENABLED", os.getenv("DUPLY_WEB_SEARCH_ENABLED", "false")).strip().lower() in {"1", "true", "yes"}
WEB_IMAGE_CACHE_TTL_SECONDS = int(os.getenv("DUPLY_WEB_IMAGE_CACHE_TTL_SECONDS", "86400"))
SOURCE_IMAGE_LOOKUP_ENABLED = os.getenv("DUPLY_SOURCE_IMAGE_LOOKUP_ENABLED", "true").strip().lower() in {"1", "true", "yes"}

_allowed_brands = None
_search_cache = {}
_image_cache = {}
_web_product_cache = {}


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


def _find_allowed_brand(text):
    normalized_text = f" {normalize_text(text)} "
    if not normalized_text.strip():
        return ""

    matches = []
    for normalized_brand, display_brand in _load_allowed_brands().items():
        pattern = f" {normalized_brand} "
        if pattern in normalized_text:
            matches.append((len(normalized_brand), display_brand))

    if not matches:
        return ""

    matches.sort(reverse=True)
    return matches[0][1]


def _extract_price(raw_price):
    if raw_price is None:
        return 0

    if isinstance(raw_price, (int, float)):
        return round(float(raw_price), 2)

    match = re.search(r"(\d+(?:\.\d{1,2})?)", str(raw_price).replace(",", ""))
    if not match:
        return 0

    return round(float(match.group(1)), 2)


def _infer_product_type(title):
    text = normalize_text(title)
    rules = [
        ("foundation", "foundation"),
        ("concealer", "concealer"),
        ("blush", "blush"),
        ("bronzer", "bronzer"),
        ("powder", "powder"),
        ("primer", "primer"),
        ("highlighter", "highlighter"),
        ("highlight", "highlighter"),
        ("lipstick", "lipstick"),
        ("lip gloss", "lipstick"),
        ("gloss", "lipstick"),
        ("eyeshadow", "eyeshadow"),
        ("eye shadow", "eyeshadow"),
        ("eyeliner", "eyeliner"),
        ("eye liner", "eyeliner"),
        ("mascara", "mascara"),
        ("brow", "eyebrow"),
        ("nail", "nail_polish"),
        ("cleanser", "cleanser"),
        ("moisturizer", "moisturizer"),
        ("serum", "serum"),
        ("sunscreen", "sunscreen"),
        ("perfume", "perfume"),
    ]

    for needle, product_type in rules:
        if needle in text:
            return product_type

    return "general"


def _extract_release_year(text):
    for year in WEB_SEARCH_YEARS:
        if re.search(rf"\b{re.escape(year)}\b", text or ""):
            return int(year)
    return None


def _web_product_id(item):
    raw_key = "|".join([
        normalize_text(item.get("brand")),
        normalize_text(item.get("product_name")),
        normalize_text(item.get("title-href")),
    ])
    digest = hashlib.sha1(raw_key.encode("utf-8")).hexdigest()[:16]
    return f"web-{digest}"


def _cache_get(cache, key):
    entry = cache.get(key)
    if not entry:
        return None

    cached_at, value = entry
    ttl = WEB_IMAGE_CACHE_TTL_SECONDS if cache is _image_cache else WEB_SEARCH_CACHE_TTL_SECONDS
    if (time.time() - cached_at) > ttl:
        cache.pop(key, None)
        return None

    return value


def _cache_set(cache, key, value):
    cache[key] = (time.time(), value)


def _serpapi_get(params):
    url = "https://serpapi.com/search.json?" + urlencode(params)
    request = Request(url, headers={"User-Agent": "Duply/1.0"})

    with urlopen(request, timeout=12) as response:
        return json.loads(response.read().decode("utf-8"))


def _normalize_serpapi_item(item, fallback_brand):
    title = str(item.get("title") or "").strip()
    source_text = " ".join([
        title,
        str(item.get("source") or ""),
        str(item.get("snippet") or ""),
        str(item.get("extensions") or ""),
    ])
    brand = _find_allowed_brand(source_text) or fallback_brand

    if not brand:
        return None

    product_type = _infer_product_type(title)
    release_year = _extract_release_year(source_text)

    product_url = item.get("product_link") or item.get("link") or ""
    image = item.get("thumbnail") or item.get("serpapi_thumbnail") or ""

    normalized = {
        "brand": brand,
        "product_name": title,
        "category": product_type,
        "subcategory": normalize_product_type(product_type),
        "type": normalize_product_type(product_type),
        "price": _extract_price(item.get("extracted_price") or item.get("price")),
        "rating": item.get("rating") or 0,
        "image": image,
        "website": item.get("source") or "web",
        "title-href": product_url,
        "releaseYear": release_year,
        "source": "web",
        "raw": {
            "source": "web",
            "website": item.get("source") or "",
            "productUrl": product_url,
            "releaseYear": release_year,
            "snippet": item.get("snippet") or "",
        },
    }
    normalized["firestore_id"] = _web_product_id(normalized)
    normalized["combined_text"] = " ".join([
        normalized["brand"],
        normalized["product_name"],
        normalized["category"],
        str(normalized.get("releaseYear") or ""),
    ]).strip()

    _web_product_cache[normalized["firestore_id"]] = normalized
    return normalized


def _meaningful_tokens(value):
    stopwords = {
        "the", "and", "for", "with", "new", "makeup", "product", "set", "mini",
        "travel", "size", "pack", "shade", "color", "colour", "no", "spf",
    }
    tokens = re.findall(r"[a-z0-9]+", normalize_text(value))
    return [token for token in tokens if len(token) > 2 and token not in stopwords]


def _looks_like_product_image_result(item, brand, product_name):
    text = normalize_text(" ".join([
        str(item.get("title") or ""),
        str(item.get("source") or ""),
        str(item.get("snippet") or ""),
    ]))
    if normalize_text(brand) not in text:
        return False

    tokens = _meaningful_tokens(product_name)
    if not tokens:
        return True

    token_matches = sum(1 for token in tokens[:6] if token in text)
    return token_matches >= max(1, min(3, len(tokens)))


def _candidate_image_url(item):
    return (
        item.get("thumbnail")
        or item.get("serpapi_thumbnail")
        or item.get("original")
        or item.get("image")
        or ""
    )


def _looks_like_http_image(value):
    return isinstance(value, str) and value.startswith(("http://", "https://", "//"))


def _source_image_cache_key(product_url):
    return ("source", normalize_text(product_url))


def _find_source_page_image(product_url):
    product_url = str(product_url or "").strip()
    if not SOURCE_IMAGE_LOOKUP_ENABLED or not product_url:
        return ""

    cached = _cache_get(_image_cache, _source_image_cache_key(product_url))
    if cached is not None:
        return cached

    try:
        request = Request(
            product_url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; Duply/1.0; +https://duply.app)",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        with urlopen(request, timeout=4) as response:
            page_html = response.read(400000).decode("utf-8", errors="ignore")
            final_url = response.geturl()
    except Exception:
        _cache_set(_image_cache, _source_image_cache_key(product_url), "")
        return ""

    patterns = [
        r'<meta[^>]+property=["\']og:image(?::secure_url)?["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image(?::secure_url)?["\']',
        r'<meta[^>]+name=["\']twitter:image(?::src)?["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image(?::src)?["\']',
        r'"image"\s*:\s*"([^"]+)"',
        r'"hiRes"\s*:\s*"([^"]+)"',
        r'"large"\s*:\s*"([^"]+)"',
    ]

    for pattern in patterns:
        match = re.search(pattern, page_html, flags=re.IGNORECASE)
        if not match:
            continue
        image_url = html.unescape(match.group(1).replace("\\/", "/").strip())
        if image_url.startswith("//"):
            image_url = f"https:{image_url}"
        elif image_url.startswith("/"):
            image_url = urljoin(final_url, image_url)
        if _looks_like_http_image(image_url):
            _cache_set(_image_cache, _source_image_cache_key(product_url), image_url)
            return image_url

    _cache_set(_image_cache, _source_image_cache_key(product_url), "")
    return ""


def find_product_image(brand, product_name, product_url=""):
    brand = str(brand or "").strip()
    product_name = str(product_name or "").strip()

    source_image = _find_source_page_image(product_url)
    if source_image:
        return source_image

    if not WEB_IMAGE_LOOKUP_ENABLED or not SERPAPI_API_KEY or not brand or not product_name:
        return ""

    if normalize_text(brand) not in _load_allowed_brands():
        return ""

    cache_key = (normalize_text(brand), normalize_text(product_name))
    cached = _cache_get(_image_cache, cache_key)
    if cached is not None:
        return cached

    queries = [
        {
            "engine": "google_shopping",
            "q": f"{brand} {product_name}",
            "api_key": SERPAPI_API_KEY,
            "num": "6",
        },
        {
            "engine": "google_images",
            "q": f"{brand} {product_name} product image",
            "api_key": SERPAPI_API_KEY,
        },
    ]

    for params in queries:
        try:
            response = _serpapi_get(params)
        except Exception:
            continue

        items = response.get("shopping_results") or response.get("images_results") or response.get("organic_results") or []
        for item in items:
            image_url = _candidate_image_url(item)
            if image_url and _looks_like_product_image_result(item, brand, product_name):
                _cache_set(_image_cache, cache_key, image_url)
                return image_url

    _cache_set(_image_cache, cache_key, "")
    return ""


def get_web_product_by_id(product_id):
    return _web_product_cache.get(product_id)


def search_web_products(query, limit=WEB_SEARCH_MAX_RESULTS):
    normalized_query = normalize_text(query)
    if not WEB_SEARCH_ENABLED or not SERPAPI_API_KEY or not normalized_query:
        return []

    query_brand = _find_allowed_brand(query)

    cache_key = (normalized_query, limit)
    cached = _cache_get(_search_cache, cache_key)
    if cached is not None:
        return cached

    year_terms = " OR ".join(WEB_SEARCH_YEARS)
    search_query = f'{query} new makeup product {year_terms}'.strip()

    try:
        response = _serpapi_get({
            "engine": "google_shopping",
            "q": search_query,
            "api_key": SERPAPI_API_KEY,
            "num": str(max(limit, 10)),
        })
    except Exception:
        _cache_set(_search_cache, cache_key, [])
        return []

    items = response.get("shopping_results") or response.get("organic_results") or []
    results = []
    seen = set()

    for item in items:
        product = _normalize_serpapi_item(item, query_brand)
        if not product:
            continue

        if query_brand and normalize_text(product.get("brand")) != normalize_text(query_brand):
            continue

        key = (normalize_text(product.get("brand")), normalize_text(product.get("product_name")))
        if key in seen:
            continue
        seen.add(key)
        results.append(product)

        if len(results) >= limit:
            break

    _cache_set(_search_cache, cache_key, results)
    return results
