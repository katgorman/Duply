import hashlib
import html
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
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
_price_match_cache = {}
_url_status_cache = {}

URL_STATUS_CACHE_TTL_SECONDS = int(os.getenv("DUPLY_URL_STATUS_CACHE_TTL_SECONDS", "21600"))
URL_CHECK_TIMEOUT_SECONDS = int(os.getenv("DUPLY_URL_CHECK_TIMEOUT_SECONDS", "5"))

DEAD_PAGE_MARKERS = [
    "product not found",
    "page not found",
    "404 not found",
    "error 404",
    "this page cannot be found",
    "this item is no longer available",
    "this product is no longer available",
    "this product is unavailable",
    "this product has been discontinued",
    "discontinued on our website",
    "we could not find the page you requested",
]

LIVE_PAGE_MARKERS = [
    "add to bag",
    "add to cart",
    "buy now",
    "product details",
    "ingredients",
    "reviews",
    "ratings",
]

TOP_BRANDS = {
    "l'oreal paris": "L'Oréal Paris",
    "maybelline new york": "Maybelline New York",
    "e.l.f. cosmetics": "e.l.f. Cosmetics",
    "nyx professional makeup": "NYX Professional Makeup",
    "revlon": "Revlon",
    "covergirl": "CoverGirl",
    "estee lauder": "Estée Lauder",
    "mac cosmetics": "MAC Cosmetics",
    "tarte cosmetics": "Tarte Cosmetics",
    "nars cosmetics": "NARS Cosmetics",
    "dior beauty": "Dior Beauty",
    "chanel beauty": "Chanel Beauty",
    "rare beauty": "Rare Beauty",
    "fenty beauty": "Fenty Beauty",
    "charlotte tilbury": "Charlotte Tilbury",
    "glossier": "Glossier",
    "rhode": "Rhode",
    "sol de janeiro": "Sol de Janeiro",
    "milk makeup": "Milk Makeup",
}

TOP_BRAND_ALIASES = {
    "loreal paris": "l'oreal paris",
    "l'oréal paris": "l'oreal paris",
    "estée lauder": "estee lauder",
    "mac": "mac cosmetics",
    "nars": "nars cosmetics",
    "tarte": "tarte cosmetics",
    "dior": "dior beauty",
    "chanel": "chanel beauty",
    "elf cosmetics": "e.l.f. cosmetics",
    "elf": "e.l.f. cosmetics",
    "nyx": "nyx professional makeup",
}

APPROVED_RETAILER_DOMAINS = {
    "ulta.com",
    "sephora.com",
    "target.com",
    "walmart.com",
    "cvs.com",
    "walgreens.com",
    "kohls.com",
    "macys.com",
    "nordstrom.com",
    "beautylish.com",
    "rarebeauty.com",
    "fentybeauty.com",
    "charlottetilbury.com",
    "glossier.com",
    "rhodeskin.com",
    "soldejaneiro.com",
    "milkmakeup.com",
    "elfcosmetics.com",
    "nyxcosmetics.com",
    "revlon.com",
    "covergirl.com",
    "maybelline.com",
    "lorealparisusa.com",
    "esteelauder.com",
    "maccosmetics.com",
    "tartecosmetics.com",
    "narscosmetics.com",
    "dior.com",
    "chanel.com",
}

BLOCKED_MARKETPLACE_DOMAINS = {
    "ebay.com",
    "mercari.com",
    "poshmark.com",
    "depop.com",
    "amazon.com",
    "amazon.co.uk",
    "amazon.ca",
    "amazon.in",
}

LIVE_AUGMENTATION_LIMIT_PER_BRAND = int(os.getenv("DUPLY_LIVE_LIMIT_PER_BRAND", "6"))
LIVE_CATEGORY_MAX_BRANDS = int(os.getenv("DUPLY_LIVE_CATEGORY_MAX_BRANDS", "19"))

CATEGORY_SEARCH_TERMS = {
    "foundation": "foundation",
    "concealer": "concealer",
    "blush": "blush",
    "bronzer": "bronzer",
    "powder": "powder",
    "primer": "primer",
    "highlighter": "highlighter",
    "lipstick": "lipstick",
    "eyeshadow": "eyeshadow palette",
    "eyeliner": "eyeliner",
    "mascara": "mascara",
    "eyebrow": "brow makeup",
    "cleanser": "cleanser",
    "moisturizer": "moisturizer",
    "serum": "serum",
    "sunscreen": "sunscreen",
    "face": "makeup",
    "lips": "lip makeup",
    "eyes": "eye makeup",
    "skincare": "skincare",
}


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


def _canonical_top_brand(value):
    normalized = normalize_text(value)
    if normalized in TOP_BRANDS:
        return normalized
    return TOP_BRAND_ALIASES.get(normalized, "")


def _display_brand(value):
    canonical = _canonical_top_brand(value)
    if canonical:
        return TOP_BRANDS[canonical]
    return str(value or "").strip()


def _all_allowed_brand_displays():
    brands = dict(_load_allowed_brands())
    for canonical, display_brand in TOP_BRANDS.items():
        brands.setdefault(canonical, display_brand)
    return brands


def _find_supported_brand(text):
    normalized_text = f" {normalize_text(text)} "
    if not normalized_text.strip():
        return ""

    matches = []
    for normalized_brand, display_brand in _all_allowed_brand_displays().items():
        if f" {normalized_brand} " in normalized_text:
            matches.append((len(normalized_brand), display_brand))

    for alias, canonical in TOP_BRAND_ALIASES.items():
        if f" {alias} " in normalized_text:
            matches.append((len(alias), TOP_BRANDS[canonical]))

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
    if cache is _image_cache:
        ttl = WEB_IMAGE_CACHE_TTL_SECONDS
    elif cache is _url_status_cache:
        ttl = URL_STATUS_CACHE_TTL_SECONDS
    else:
        ttl = WEB_SEARCH_CACHE_TTL_SECONDS
    if (time.time() - cached_at) > ttl:
        cache.pop(key, None)
        return None

    return value


def _cache_set(cache, key, value):
    cache[key] = (time.time(), value)


def _url_status_cache_key(url):
    return ("url-status", normalize_text(url))


def _looks_like_missing_page(page_html, final_url=""):
    html_text = normalize_text(page_html)
    final_url_text = normalize_text(final_url)

    if any(marker in html_text for marker in LIVE_PAGE_MARKERS):
        return False

    if any(marker in html_text for marker in DEAD_PAGE_MARKERS):
        return True

    if "/404" in final_url_text or "not-found" in final_url_text or "product-not-found" in final_url_text:
        return True

    return False


def is_live_product_url(url):
    url = str(url or "").strip()
    if not url.startswith(("http://", "https://")):
        return False

    cache_key = _url_status_cache_key(url)
    cached = _cache_get(_url_status_cache, cache_key)
    if cached is not None:
        return cached

    try:
        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; Duply/1.0; +https://duply.app)",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        with urlopen(request, timeout=URL_CHECK_TIMEOUT_SECONDS) as response:
            status = getattr(response, "status", 200) or 200
            final_url = response.geturl()
            page_html = response.read(120000).decode("utf-8", errors="ignore")
    except Exception:
        _cache_set(_url_status_cache, cache_key, False)
        return False

    is_live = status < 400 and not _looks_like_missing_page(page_html, final_url)
    _cache_set(_url_status_cache, cache_key, is_live)
    return is_live


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
    brand = _find_supported_brand(source_text) or _display_brand(fallback_brand)

    if not brand:
        return None

    product_type = _infer_product_type(title)
    release_year = _extract_release_year(source_text)

    product_url = item.get("product_link") or item.get("link") or ""
    image = item.get("thumbnail") or item.get("serpapi_thumbnail") or ""
    if not _is_approved_retailer_url(product_url):
        return None

    normalized = {
        "brand": _display_brand(brand),
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


def _price_match_cache_key(brand, product_name, limit):
    return ("price-match", normalize_text(brand), normalize_text(product_name), limit)


def _source_domain(url):
    match = re.search(r"https?://(?:www\.)?([^/?#]+)", str(url or ""), flags=re.IGNORECASE)
    return match.group(1).lower() if match else ""


def _is_blocked_marketplace_domain(domain):
    domain = str(domain or "").lower()
    return any(domain == blocked or domain.endswith(f".{blocked}") for blocked in BLOCKED_MARKETPLACE_DOMAINS)


def _is_approved_retailer_domain(domain):
    domain = str(domain or "").lower()
    if not domain or _is_blocked_marketplace_domain(domain):
        return False
    return any(domain == approved or domain.endswith(f".{approved}") for approved in APPROVED_RETAILER_DOMAINS)


def _is_approved_retailer_url(url):
    return _is_approved_retailer_domain(_source_domain(url))


def is_approved_retailer_url(url):
    return _is_approved_retailer_url(url)


def _offer_retailer(item):
    source = str(item.get("source") or item.get("seller") or item.get("merchant") or "").strip()
    if source:
        return source

    domain = _source_domain(item.get("product_link") or item.get("link") or "")
    if not domain:
        return "Retailer"

    return domain.split(".")[0].replace("-", " ").title()


def _offer_shipping(item):
    delivery = item.get("delivery") or item.get("shipping") or ""
    if isinstance(delivery, list):
        return ", ".join(str(part) for part in delivery if part)
    return str(delivery or "").strip()


def _title_match_confidence(title, brand, product_name):
    text = normalize_text(title)
    brand_text = normalize_text(brand)
    tokens = _meaningful_tokens(product_name)

    if brand_text and brand_text not in text:
        return 0

    if not tokens:
        return 60 if brand_text else 0

    matched = sum(1 for token in tokens[:8] if token in text)
    token_score = matched / min(len(tokens), 8)
    brand_bonus = 25 if brand_text and brand_text in text else 0
    return round((token_score * 75) + brand_bonus)


def _normalize_offer(item, brand, product_name, index):
    title = str(item.get("title") or "").strip()
    url = item.get("product_link") or item.get("link") or ""
    price = _extract_price(item.get("extracted_price") or item.get("price"))
    confidence = _title_match_confidence(title, brand, product_name)

    if not title or not url or price <= 0 or confidence < 45:
        return None

    if not _is_approved_retailer_url(url):
        return None

    if not is_live_product_url(url):
        return None

    raw_key = "|".join([
        normalize_text(title),
        normalize_text(_offer_retailer(item)),
        normalize_text(url),
    ])
    digest = hashlib.sha1(raw_key.encode("utf-8")).hexdigest()[:14]

    return {
        "id": f"offer-{digest}",
        "retailer": _offer_retailer(item),
        "title": title,
        "price": price,
        "url": url,
        "image": item.get("thumbnail") or item.get("serpapi_thumbnail") or "",
        "shipping": _offer_shipping(item),
        "source": item.get("source") or "",
        "matchConfidence": confidence,
        "rank": index,
    }


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


def _search_term_for_category(category_or_type):
    normalized = normalize_product_type(category_or_type)
    return CATEGORY_SEARCH_TERMS.get(normalized, category_or_type or "makeup")


def _matches_search_target(product, category_or_type):
    if not category_or_type:
        return True

    normalized_target = normalize_product_type(category_or_type)
    product_type = normalize_product_type(product.get("subcategory") or product.get("type") or product.get("category"))
    if normalized_target in {"face", "lips", "eyes", "skincare"}:
        buckets = {
            "face": {"foundation", "concealer", "blush", "bronzer", "powder", "primer", "highlighter"},
            "lips": {"lipstick"},
            "eyes": {"eyeshadow", "eyeliner", "mascara", "eyebrow"},
            "skincare": {"cleanser", "moisturizer", "serum", "sunscreen"},
        }
        return product_type in buckets.get(normalized_target, set())

    return not normalized_target or product_type == normalized_target


def _brand_catalog_cache_key(brand, category_or_type, limit):
    return ("brand-catalog", normalize_text(brand), normalize_product_type(category_or_type), limit)


def _search_brand_catalog(brand, category_or_type="", limit=LIVE_AUGMENTATION_LIMIT_PER_BRAND):
    display_brand = _display_brand(brand)
    if not SERPAPI_API_KEY or not display_brand:
        return []

    cache_key = _brand_catalog_cache_key(display_brand, category_or_type, limit)
    cached = _cache_get(_search_cache, cache_key)
    if cached is not None:
        return cached

    search_term = _search_term_for_category(category_or_type)
    query = f"{display_brand} {search_term}".strip()

    try:
        response = _serpapi_get({
            "engine": "google_shopping",
            "q": query,
            "api_key": SERPAPI_API_KEY,
            "num": str(max(limit * 3, 16)),
        })
    except Exception:
        _cache_set(_search_cache, cache_key, [])
        return []

    items = response.get("shopping_results") or response.get("organic_results") or []
    results = []
    seen = set()
    brand_key = _canonical_top_brand(display_brand) or normalize_text(display_brand)

    for item in items:
        product = _normalize_serpapi_item(item, display_brand)
        if not product:
            continue

        product_brand_key = _canonical_top_brand(product.get("brand")) or normalize_text(product.get("brand"))
        if brand_key and product_brand_key != brand_key:
            continue
        if not _matches_search_target(product, category_or_type):
            continue

        key = (
            normalize_text(product.get("brand")),
            normalize_text(product.get("product_name")),
        )
        if key in seen:
            continue
        seen.add(key)
        results.append(product)
        if len(results) >= limit:
            break

    _cache_set(_search_cache, cache_key, results)
    return results


def discover_live_category_products(category_or_type, limit=36):
    normalized_target = normalize_product_type(category_or_type)
    cache_key = ("live-category", normalized_target, limit)
    cached = _cache_get(_search_cache, cache_key)
    if cached is not None:
        return cached

    brands = list(TOP_BRANDS.values())[:LIVE_CATEGORY_MAX_BRANDS]
    results = []
    seen = set()

    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {
            executor.submit(_search_brand_catalog, brand, normalized_target, min(4, LIVE_AUGMENTATION_LIMIT_PER_BRAND)): brand
            for brand in brands
        }
        for future in as_completed(futures):
            try:
                items = future.result()
            except Exception:
                continue
            for product in items:
                key = (
                    normalize_text(product.get("brand")),
                    normalize_text(product.get("product_name")),
                )
                if key in seen:
                    continue
                seen.add(key)
                results.append(product)
                if len(results) >= limit:
                    _cache_set(_search_cache, cache_key, results[:limit])
                    return results[:limit]

    _cache_set(_search_cache, cache_key, results[:limit])
    return results[:limit]


def find_live_dupe_candidates(brand, product_name, product_type="", category="", price=0, limit=18):
    display_brand = _display_brand(brand)
    target_type = normalize_product_type(product_type or category)
    if not SERPAPI_API_KEY or not target_type:
        return []

    cache_key = (
        "live-dupes",
        normalize_text(display_brand),
        normalize_text(product_name),
        target_type,
        round(float(price or 0), 2),
        limit,
    )
    cached = _cache_get(_search_cache, cache_key)
    if cached is not None:
        return cached

    candidate_brands = [brand_name for brand_name in TOP_BRANDS.values() if normalize_text(brand_name) != normalize_text(display_brand)]
    results = []
    seen = set()

    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {
            executor.submit(_search_brand_catalog, candidate_brand, target_type, min(3, LIVE_AUGMENTATION_LIMIT_PER_BRAND)): candidate_brand
            for candidate_brand in candidate_brands
        }
        for future in as_completed(futures):
            try:
                items = future.result()
            except Exception:
                continue
            for product in items:
                key = (
                    normalize_text(product.get("brand")),
                    normalize_text(product.get("product_name")),
                )
                if key in seen:
                    continue
                seen.add(key)
                if normalize_text(product.get("brand")) == normalize_text(display_brand):
                    continue
                if price and _extract_price(product.get("price")) <= 0:
                    continue
                results.append(product)
                if len(results) >= limit:
                    _cache_set(_search_cache, cache_key, results[:limit])
                    return results[:limit]

    _cache_set(_search_cache, cache_key, results[:limit])
    return results[:limit]


def get_web_product_by_id(product_id):
    return _web_product_cache.get(product_id)


def search_web_products(query, limit=WEB_SEARCH_MAX_RESULTS):
    normalized_query = normalize_text(query)
    query_brand = _find_supported_brand(query)
    if not SERPAPI_API_KEY or not normalized_query:
        return []
    if not WEB_SEARCH_ENABLED and not query_brand:
        return []

    cache_key = (normalized_query, limit)
    cached = _cache_get(_search_cache, cache_key)
    if cached is not None:
        return cached

    search_query = f"{query} beauty".strip()

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
        product = _normalize_serpapi_item(item, query_brand or "")
        if not product:
            continue

        if query_brand:
            query_brand_key = _canonical_top_brand(query_brand) or normalize_text(query_brand)
            product_brand_key = _canonical_top_brand(product.get("brand")) or normalize_text(product.get("brand"))
            if product_brand_key != query_brand_key:
                continue

        if not is_live_product_url(product.get("title-href")):
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


def find_price_matches(brand, product_name, limit=8):
    brand = str(brand or "").strip()
    product_name = str(product_name or "").strip()
    if not SERPAPI_API_KEY or not product_name:
        return []

    cache_key = _price_match_cache_key(brand, product_name, limit)
    cached = _cache_get(_price_match_cache, cache_key)
    if cached is not None:
        return cached

    query = f"{brand} {product_name}".strip()
    try:
        response = _serpapi_get({
            "engine": "google_shopping",
            "q": query,
            "api_key": SERPAPI_API_KEY,
            "num": str(max(limit * 2, 12)),
        })
    except Exception:
        _cache_set(_price_match_cache, cache_key, [])
        return []

    items = response.get("shopping_results") or []
    offers = []
    seen = set()

    for index, item in enumerate(items):
        offer = _normalize_offer(item, brand, product_name, index)
        if not offer:
            continue

        dedupe_key = (
            normalize_text(offer["retailer"]),
            normalize_text(offer["title"]),
            round(offer["price"], 2),
        )
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        offers.append(offer)

    offers.sort(key=lambda offer: (offer["price"], -offer["matchConfidence"], offer["rank"]))
    normalized_offers = [{key: value for key, value in offer.items() if key != "rank"} for offer in offers[:limit]]
    _cache_set(_price_match_cache, cache_key, normalized_offers)
    return normalized_offers
