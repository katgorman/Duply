from pathlib import Path
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parent / ".env")

from firestore_products import (
    category_counts,
    fetch_firestore_product,
    get_firestore_status,
    get_firestore_product_by_id,
    list_products_by_category,
    normalize_product_type,
    search_firestore_products,
)
from recommendation_system import find_dupes, get_recommendation_status, lookup_product
from web_products import (
    augment_firestore_catalog_with_top_brands,
    find_price_matches,
    find_product_image,
    get_dataforseo_status,
    is_approved_retailer_url,
    is_live_product_url,
    search_web_products,
    title_match_confidence,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RESPONSE_CACHE_TTL_SECONDS = 300
_response_cache = {}


def _cache_get(key):
    entry = _response_cache.get(key)
    if not entry:
        return None

    cached_at, value = entry
    if time.time() - cached_at > RESPONSE_CACHE_TTL_SECONDS:
        _response_cache.pop(key, None)
        return None

    return value


def _cache_set(key, value):
    _response_cache[key] = (time.time(), value)
    return value


def _normalize_number(value, default=0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_price(value):
    price = _normalize_number(value, 0)
    if price > 100:
        return round(price / 100, 2)
    return round(price, 2)


def _slugify(value: str) -> str:
    return (value or "").strip().lower().replace(" ", "-")


def _normalize_text(value):
    if value is None:
        return ""
    return str(value).strip().lower()


def _build_comparison_profile(source):
    raw = source.get("raw", {}) if source else {}
    category = source.get("category") or raw.get("Category") or raw.get("category") or ""
    product_type = source.get("productType") or source.get("type") or source.get("subcategory") or category

    return {
        "brand": source.get("brand") or raw.get("Brand") or raw.get("brand") or "",
        "name": source.get("name") or source.get("product_name") or raw.get("Product_Name") or raw.get("product_name") or "",
        "category": category,
        "product_type": normalize_product_type(product_type),
        "country": raw.get("Country_of_Origin") or raw.get("country") or "",
        "cruelty_free": raw.get("Cruelty_Free") or raw.get("cruelty_free") or "",
        "gender_target": raw.get("Gender_Target") or raw.get("gender_target") or "",
        "main_ingredient": raw.get("Main_Ingredient") or raw.get("ingredients") or "",
        "packaging_type": raw.get("Packaging_Type") or raw.get("form") or "",
        "skin_type": raw.get("Skin_Type") or "",
        "product_size": raw.get("Product_Size") or raw.get("size") or "",
        "price": _normalize_price(source.get("price") if source.get("price") is not None else (raw.get("Price_USD") or raw.get("price"))),
        "rating": _normalize_number(source.get("rating"), _normalize_number(raw.get("Rating"), _normalize_number(raw.get("rating"), 0))),
    }


def _price_similarity_score(original_price, dupe_price, max_points):
    if original_price <= 0 or dupe_price <= 0:
        return 0

    relative_diff = abs(original_price - dupe_price) / max(original_price, dupe_price)
    return round(max(0, 1 - relative_diff) * max_points, 2)


def _rating_similarity_score(original_rating, dupe_rating, max_points):
    if original_rating <= 0 or dupe_rating <= 0:
        return 0

    diff = min(abs(original_rating - dupe_rating), 5)
    return round(max(0, 1 - (diff / 5)) * max_points, 2)


def _compute_match_percentage(original_source, dupe_source):
    original = _build_comparison_profile(original_source)
    dupe = _build_comparison_profile(dupe_source)

    score = 0.0
    max_score = 0.0

    weighted_fields = [
        ("product_type", 35),
        ("category", 15),
        ("main_ingredient", 10),
        ("skin_type", 10),
        ("packaging_type", 5),
        ("gender_target", 5),
        ("cruelty_free", 5),
        ("country", 5),
        ("product_size", 5),
    ]

    for field, weight in weighted_fields:
        original_value = _normalize_text(original.get(field))
        dupe_value = _normalize_text(dupe.get(field))
        if not original_value or not dupe_value:
            continue

        max_score += weight
        if original_value == dupe_value:
            score += weight

    if original["price"] > 0 and dupe["price"] > 0:
        max_score += 10
        score += _price_similarity_score(original["price"], dupe["price"], 10)

    if original["rating"] > 0 and dupe["rating"] > 0:
        max_score += 10
        score += _rating_similarity_score(original["rating"], dupe["rating"], 10)

    if max_score == 0:
        return 0.0

    percent = round((score / max_score) * 100, 1)
    return max(0.0, min(percent, 100.0))


def _build_match_reason(original_source, dupe_source):
    original = _build_comparison_profile(original_source)
    dupe = _build_comparison_profile(dupe_source)

    reasons = []

    if _normalize_text(original["product_type"]) and _normalize_text(original["product_type"]) == _normalize_text(dupe["product_type"]):
        reasons.append("same product type")

    if _normalize_text(original["category"]) and _normalize_text(original["category"]) == _normalize_text(dupe["category"]):
        reasons.append("same category")

    if _normalize_text(original["skin_type"]) and _normalize_text(original["skin_type"]) == _normalize_text(dupe["skin_type"]):
        reasons.append("same skin type")

    if _normalize_text(original["main_ingredient"]) and _normalize_text(original["main_ingredient"]) == _normalize_text(dupe["main_ingredient"]):
        reasons.append("same main ingredient")

    if _normalize_text(original["packaging_type"]) and _normalize_text(original["packaging_type"]) == _normalize_text(dupe["packaging_type"]):
        reasons.append("same packaging")

    if _normalize_text(original["product_size"]) and _normalize_text(original["product_size"]) == _normalize_text(dupe["product_size"]):
        reasons.append("same size")

    if original["price"] > 0 and dupe["price"] > 0:
        relative_diff = abs(original["price"] - dupe["price"]) / max(original["price"], dupe["price"])
        if relative_diff <= 0.15:
            reasons.append("very close price")
        elif relative_diff <= 0.35:
            reasons.append("similar price")

    if original["rating"] > 0 and dupe["rating"] > 0 and abs(original["rating"] - dupe["rating"]) <= 0.5:
        reasons.append("similar rating")

    if not reasons:
        grounded_fallback = []
        if _normalize_text(original["product_type"]) and _normalize_text(dupe["product_type"]):
            grounded_fallback.append("product type")
        if original["price"] > 0 and dupe["price"] > 0:
            grounded_fallback.append("price")
        if original["rating"] > 0 and dupe["rating"] > 0:
            grounded_fallback.append("rating")

        if grounded_fallback:
            return f"Matched using available {', '.join(grounded_fallback[:3])} data"

        return "Matched using available product data"

    return ", ".join(reasons[:3])


def _product_from_record(record, fallback=None, enrich_image=False):
    fallback = fallback or {}

    explicit_id = record.get("firestore_id") or fallback.get("id", "")
    brand = record.get("brand") or fallback.get("brand", "")
    name = record.get("product_name") or fallback.get("name", "")
    category = record.get("category") or fallback.get("category", "") or ""
    product_type = normalize_product_type(
        record.get("type") or record.get("subcategory") or fallback.get("productType", "") or category
    )
    raw = record.get("raw", {})
    image = record.get("image") or fallback.get("image", "")
    product_url = record.get("title-href") or raw.get("productUrl") or raw.get("title-href") or ""
    if enrich_image and not image:
        image = find_product_image(brand, name, product_url)

    return {
        "id": explicit_id or _slugify(f"{brand}-{name}"),
        "name": name,
        "brand": brand,
        "price": _normalize_price(record.get("price") if record.get("price") is not None else fallback.get("price")),
        "image": image,
        "rating": _normalize_number(record.get("rating"), _normalize_number(fallback.get("rating"), 0)),
        "category": category,
        "productType": product_type,
        "countryOfOrigin": raw.get("Country_of_Origin") or raw.get("country") or record.get("countryOfOrigin") or "",
        "crueltyFree": raw.get("Cruelty_Free") or record.get("crueltyFree") or "",
        "genderTarget": raw.get("Gender_Target") or record.get("genderTarget") or "",
        "mainIngredient": raw.get("Main_Ingredient") or raw.get("ingredients") or record.get("mainIngredient") or "",
        "numberOfReviews": int(_normalize_number(raw.get("Number_of_Reviews"), _normalize_number(raw.get("noofratings"), record.get("numberOfReviews") or 0))),
        "packagingType": raw.get("Packaging_Type") or raw.get("form") or record.get("packagingType") or "",
        "productSize": raw.get("Product_Size") or raw.get("size") or record.get("productSize") or "",
        "skinType": raw.get("Skin_Type") or record.get("skinType") or "",
        "source": record.get("source") or raw.get("source") or "catalog",
        "productUrl": product_url,
        "releaseYear": record.get("releaseYear") or raw.get("releaseYear") or None,
    }


def _product_identity_key(product):
    return (
        _normalize_text(product.get("brand")),
        _normalize_text(product.get("name")),
        normalize_product_type(product.get("productType") or product.get("category")),
    )


def _finalize_product(product, require_image=True):
    if not product:
        return None

    normalized = {
        **product,
        "id": str(product.get("id") or "").strip(),
        "name": str(product.get("name") or "").strip(),
        "brand": str(product.get("brand") or "").strip(),
        "image": str(product.get("image") or "").strip(),
        "category": str(product.get("category") or "").strip(),
        "productType": normalize_product_type(product.get("productType") or product.get("category") or ""),
        "productUrl": str(product.get("productUrl") or "").strip(),
        "source": product.get("source") or "catalog",
        "price": _normalize_price(product.get("price")),
        "rating": _normalize_number(product.get("rating"), 0),
        "countryOfOrigin": str(product.get("countryOfOrigin") or "").strip(),
        "crueltyFree": str(product.get("crueltyFree") or "").strip(),
        "genderTarget": str(product.get("genderTarget") or "").strip(),
        "mainIngredient": str(product.get("mainIngredient") or "").strip(),
        "packagingType": str(product.get("packagingType") or "").strip(),
        "productSize": str(product.get("productSize") or "").strip(),
        "skinType": str(product.get("skinType") or "").strip(),
        "numberOfReviews": int(_normalize_number(product.get("numberOfReviews"), 0)),
    }

    if not normalized["id"]:
        normalized["id"] = _slugify(f"{normalized['brand']}-{normalized['name']}")

    if not normalized["name"] or not normalized["brand"]:
        return None
    if not normalized["category"] or not normalized["productType"]:
        return None
    if normalized["price"] <= 0:
        return None
    if require_image and not normalized["image"]:
        return None

    return normalized


def _dedupe_products(products, require_image=True):
    deduped = []
    seen = set()

    for product in products:
        finalized = _finalize_product(product, require_image=require_image)
        if not finalized:
            continue
        key = _product_identity_key(finalized)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(finalized)

    return deduped


def _is_product_available(product):
    if not product:
        return False

    product_url = product.get("productUrl") or ""
    if not product_url:
        return False
    if not is_approved_retailer_url(product_url):
        return False

    return is_live_product_url(product_url)


def _meaningful_tokens(value):
    stopwords = {
        "the", "and", "for", "with", "new", "makeup", "product", "set", "mini",
        "travel", "size", "pack", "shade", "color", "colour", "no", "spf",
    }
    tokens = re.findall(r"[a-z0-9]+", _normalize_text(value))
    return [token for token in tokens if len(token) > 2 and token not in stopwords]


def _live_match_score(candidate, brand, name, product_type="", category=""):
    if not candidate:
        return 0

    candidate_brand = _normalize_text(candidate.get("brand"))
    target_brand = _normalize_text(brand)
    candidate_name = _normalize_text(candidate.get("name"))
    target_type = normalize_product_type(product_type or category)
    candidate_type = normalize_product_type(candidate.get("productType") or candidate.get("category"))

    score = 0
    if target_brand and candidate_brand == target_brand:
        score += 40
    elif target_brand and target_brand in candidate_brand:
        score += 24

    score += min(50, title_match_confidence(candidate_name, brand, name))

    target_tokens = _meaningful_tokens(name)
    if target_tokens:
        matched = sum(1 for token in target_tokens[:8] if token in candidate_name)
        score += round((matched / min(len(target_tokens), 8)) * 20)

    if target_type and candidate_type == target_type:
        score += 12

    return score


def _resolve_live_product(product):
    if not product:
        return None

    if _is_product_available(product):
        return product

    brand = product.get("brand") or ""
    name = product.get("name") or ""
    product_type = product.get("productType") or ""
    category = product.get("category") or ""
    if not brand or not name:
        return None

    candidates = []
    seen_candidates = set()
    for query in [f"{brand} {name}".strip(), name.strip(), brand.strip()]:
        normalized_query = _normalize_text(query)
        if not normalized_query:
            continue

        for candidate in search_web_products(query, limit=10):
            normalized_candidate = _finalize_product(
                _product_from_record(candidate, fallback={"id": candidate.get("firestore_id", "")}),
                require_image=False,
            )
            if not normalized_candidate or not _is_product_available(normalized_candidate):
                continue

            key = _product_identity_key(normalized_candidate)
            if key in seen_candidates:
                continue
            seen_candidates.add(key)
            candidates.append(normalized_candidate)

    if not candidates:
        return None

    ranked = sorted(
        candidates,
        key=lambda candidate: (
            -_live_match_score(candidate, brand, name, product_type=product_type, category=category),
            candidate.get("price", 0),
        ),
    )
    best_candidate = ranked[0]
    if _live_match_score(best_candidate, brand, name, product_type=product_type, category=category) < 65:
        return None

    return best_candidate


def _coerce_to_live_product(record, fallback=None, enrich_image=False):
    fallback = fallback or {"id": record.get("firestore_id", "")}
    normalized_product = _finalize_product(
        _product_from_record(record, fallback=fallback, enrich_image=enrich_image)
    )
    if not normalized_product:
        return None

    if _is_product_available(normalized_product):
        return normalized_product

    return _resolve_live_product(normalized_product)


def _search_ready_product(record, fallback=None, enrich_image=False):
    fallback = fallback or {"id": record.get("firestore_id", "")}
    return _finalize_product(
        _product_from_record(record, fallback=fallback, enrich_image=enrich_image),
        require_image=False,
    )


def _coerce_to_display_product(record, fallback=None, enrich_image=False):
    fallback = fallback or {"id": record.get("firestore_id", "")}
    normalized_product = _search_ready_product(record, fallback=fallback, enrich_image=enrich_image)
    if not normalized_product:
        return None

    if _is_product_available(normalized_product):
        return normalized_product

    resolved_product = _resolve_live_product(normalized_product)
    if resolved_product:
        return _finalize_product(resolved_product, require_image=False)

    return normalized_product


def _coerce_to_search_product(record, fallback=None, enrich_image=False):
    fallback = fallback or {"id": record.get("firestore_id", "")}
    normalized_product = _search_ready_product(record, fallback=fallback, enrich_image=enrich_image)
    if not normalized_product:
        return None

    if _is_product_available(normalized_product):
        return normalized_product

    resolved_product = _resolve_live_product(normalized_product)
    if not resolved_product:
        return None

    return _finalize_product(resolved_product, require_image=False)


def _directly_available_product(record, fallback=None, enrich_image=False, require_image=True):
    fallback = fallback or {"id": record.get("firestore_id", "")}
    normalized_product = _finalize_product(
        _product_from_record(record, fallback=fallback, enrich_image=enrich_image),
        require_image=require_image,
    )
    if not normalized_product:
        return None
    if not _is_product_available(normalized_product):
        return None
    return normalized_product


def _candidate_key(record):
    return (
        _normalize_text(record.get("brand")),
        _normalize_text(record.get("product_name") or record.get("name")),
    )


def _merge_ranked_candidates(*candidate_groups):
    merged = []
    seen = set()

    for group in candidate_groups:
        for item in group or []:
            record = item.get("record", {})
            key = _candidate_key(record)
            if not key[0] and not key[1]:
                continue
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)

    return merged


def _first_present(*values):
    for value in values:
        if value is not None and value != "":
            return value
    return None


SEARCH_FALLBACK_SUFFIXES = ["foundation", "blush", "lipstick", "concealer"]


def _is_likely_brand_query(query: str) -> bool:
    normalized = _normalize_text(query)
    if not normalized:
        return False
    if len(normalized.split()) > 4:
        return False
    if any(char.isdigit() for char in normalized):
        return False
    return bool(re.fullmatch(r"[a-z.'\-\s]+", normalized))


def _product_sort_key(product, sort_by: str):
    name = _normalize_text(product.get("name"))
    brand = _normalize_text(product.get("brand"))
    price = _normalize_price(product.get("price"))
    rating = _normalize_number(product.get("rating"), 0)
    reviews = _normalize_number(product.get("numberOfReviews"), 0)
    popularity = reviews + (rating * 100)

    if sort_by == "priceLow":
        return (price <= 0, price, name, brand)
    if sort_by == "priceHigh":
        return (price <= 0, -price, name, brand)
    if sort_by == "az":
        return (name, brand)
    if sort_by == "popular":
        return (-popularity, name, brand)
    return (name, brand)


def _search_products_once(q: str, local_limit: int, web_limit: int, max_results: int = 120):
    local_results = search_firestore_products(q, limit=local_limit)

    seen = set()
    combined = []

    # Search should still surface valid live products even if our local metadata
    # is missing an image, so we allow image-less products in this path.
    for product in local_results:
        key = (
            _normalize_text(product.get("brand")),
            _normalize_text(product.get("product_name")),
        )
        if key in seen:
            continue
        normalized_product = _search_ready_product(
            product,
            fallback={"id": product.get("firestore_id", "")},
        )
        if not normalized_product:
            continue
        seen.add(key)
        combined.append(normalized_product)
        if len(combined) >= max_results:
            break

    return _dedupe_products(combined, require_image=False)[:max_results]


def _search_products_with_fallback(q: str, local_limit: int, web_limit: int, max_results: int = 120):
    combined = _search_products_once(q, local_limit=local_limit, web_limit=0, max_results=max_results)
    if combined or not _is_likely_brand_query(q):
        return combined

    fallback_results = []
    for suffix in SEARCH_FALLBACK_SUFFIXES:
        fallback_query = f"{q} {suffix}".strip()
        fallback_results.extend(
            _search_products_once(
                fallback_query,
                local_limit=max(12, local_limit // 2),
                web_limit=0,
                max_results=max_results,
            )
        )
        if len(fallback_results) >= max_results:
            break

    return _dedupe_products(fallback_results, require_image=False)[:max_results]


@app.get("/health")
def health():
    return {"ok": True, **get_recommendation_status()}


@app.get("/admin/status")
def admin_status():
    firestore_status = get_firestore_status()
    dataforseo_status = get_dataforseo_status()

    return {
        "ok": True,
        "timestamp": int(time.time()),
        "model": get_recommendation_status(),
        "firestore": firestore_status,
        "dataforseo": dataforseo_status,
        "augmentation": {
            "ready": bool(firestore_status.get("available") and dataforseo_status.get("credentialsPresent")),
            "augmentedCount": firestore_status.get("augmentedCount"),
            "lastAugmentedAt": firestore_status.get("lastAugmentedAt"),
        },
    }


@app.post("/admin/augment-top-brands")
async def augment_top_brands(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    brands = body.get("brands") or None
    categories = body.get("categories") or None
    per_query_limit = max(1, min(int(body.get("perQueryLimit") or 12), 50))

    try:
        result = augment_firestore_catalog_with_top_brands(
            brands=brands,
            categories=categories,
            per_query_limit=per_query_limit,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/products/search")
def search_products(q: str, limit: int = 8):
    normalized_query = _normalize_text(q)
    normalized_limit = max(1, min(limit, 24))
    cache_key = ("search", normalized_query, normalized_limit)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    combined = _search_products_with_fallback(
        q,
        local_limit=max(24, normalized_limit * 3),
        web_limit=0,
        max_results=max(32, normalized_limit * 4),
    )
    return _cache_set(cache_key, combined[:normalized_limit])


@app.get("/products/search-page")
def search_products_page(q: str, page: int = 1, page_size: int = 24, sort: str = "popular"):
    normalized_query = _normalize_text(q)
    normalized_page = max(page, 1)
    normalized_page_size = max(1, min(page_size, 96))
    normalized_sort = sort if sort in {"az", "priceLow", "priceHigh", "popular"} else "popular"
    cache_key = ("search-page", normalized_query, normalized_page, normalized_page_size, normalized_sort)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    target_count = min(max(normalized_page * normalized_page_size * 4, 240), 720)
    combined = _search_products_with_fallback(
        q,
        local_limit=target_count,
        web_limit=0,
        max_results=target_count,
    )
    combined.sort(key=lambda product: _product_sort_key(product, normalized_sort))

    total = len(combined)
    total_pages = max(1, (total + normalized_page_size - 1) // normalized_page_size)
    safe_page = min(normalized_page, total_pages)
    start = (safe_page - 1) * normalized_page_size
    end = start + normalized_page_size

    return _cache_set(cache_key, {
        "items": combined[start:end],
        "total": total,
        "page": safe_page,
        "pageSize": normalized_page_size,
        "totalPages": total_pages,
    })


@app.get("/products/category/{category_or_type}")
def get_products_by_category(category_or_type: str, page: int = 1, page_size: int = 24, q: str = "", sort: str = "popular"):
    cache_key = ("category", category_or_type, page, page_size, _normalize_text(q), sort)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    result = list_products_by_category(
        category_or_type,
        limit=page_size,
        page=page,
        query=q,
        sort_by=sort,
    )
    available_items = []
    for index, product in enumerate(result["items"]):
        normalized_product = _coerce_to_display_product(
            product,
            fallback={"id": product.get("firestore_id", "")},
            enrich_image=index < 8,
        )
        if not normalized_product:
            continue
        available_items.append(normalized_product)

    available_items = _dedupe_products(available_items)

    return _cache_set(cache_key, {
        **result,
        "items": available_items[:page_size],
        "total": max(result.get("total", 0), len(available_items)),
    })


@app.get("/categories")
def get_categories():
    cache_key = ("categories",)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    counts = category_counts()
    category_meta = [
        {"id": "eyes", "name": "Eyes", "emoji": "", "productType": "eyes", "color": "#FFF9F0"},
        {"id": "lips", "name": "Lips", "emoji": "", "productType": "lips", "color": "#FFE4F0"},
        {"id": "face", "name": "Face", "emoji": "", "productType": "face", "color": "#F7C6D9"},
        {"id": "skincare", "name": "Skincare", "emoji": "", "productType": "skincare", "color": "#FFF6F9"},
        {"id": "other", "name": "Other", "emoji": "", "productType": "other", "color": "#2A0B26"},
    ]
    return _cache_set(cache_key, [
        {**category, "count": counts.get(category["productType"], 0)}
        for category in category_meta
    ])


def _legacy_category_products(category_or_type: str):
    result = list_products_by_category(category_or_type, limit=24, page=1)
    available_items = []
    for index, product in enumerate(result["items"]):
        normalized_product = _coerce_to_display_product(
            product,
            fallback={"id": product.get("firestore_id", "")},
            enrich_image=index < 8,
        )
        if not normalized_product:
            continue
        available_items.append(normalized_product)
    return _dedupe_products(available_items)


@app.post("/products/price-matches")
async def get_price_matches(request: Request):
    try:
        body = await request.json()
        product_id = body.get("id", "")
        brand = body.get("brand", "")
        name = body.get("name", "")

        if not name:
            raise HTTPException(status_code=400, detail="Product name is required")

        cache_key = ("price_matches", product_id, _normalize_text(brand), _normalize_text(name))
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        if product_id:
            product = get_firestore_product_by_id(product_id)
            merchant_offers = ((product or {}).get("raw") or {}).get("merchantOffers") or []
            normalized_offers = []
            for index, offer in enumerate(merchant_offers[:3]):
                url = offer.get("url") or ""
                price = _normalize_price(offer.get("price"))
                if not url or price <= 0:
                    continue
                normalized_offers.append({
                    "id": offer.get("id") or f"stored-offer-{index}",
                    "retailer": offer.get("retailer") or "",
                    "title": offer.get("title") or f"{brand} {name}".strip(),
                    "price": price,
                    "url": url,
                    "image": offer.get("image") or "",
                    "shipping": offer.get("shipping") or "",
                    "source": offer.get("source") or "catalog",
                    "matchConfidence": offer.get("matchConfidence") or 100,
                })
            if normalized_offers:
                return _cache_set(cache_key, normalized_offers[:3])

        return _cache_set(cache_key, find_price_matches(brand, name, limit=3))
    except HTTPException:
        raise
    except Exception as e:
        print("Error in /products/price-matches:", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/products/{product_id}")
def get_product(product_id: str):
    cache_key = ("product", product_id)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    product = get_firestore_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    normalized_product = _coerce_to_display_product(
        product,
        fallback={"id": product.get("firestore_id", "")},
        enrich_image=True,
    )
    if not normalized_product:
        raise HTTPException(status_code=404, detail="Product not found")
    return _cache_set(cache_key, normalized_product)


@app.post("/dupes")
async def get_dupes(request: Request):
    try:
        body = await request.json()

        # Only trust these fields from the frontend
        brand = body.get("brand", "")
        name = body.get("name", "")
        price = body.get("price", 0) or 0
        image = body.get("image", "") or ""
        category = body.get("category", "") or ""
        product_type = body.get("productType", "") or ""
        cache_key = ("dupes", _normalize_text(brand), _normalize_text(name), _normalize_text(category), _normalize_text(product_type), _normalize_price(price))
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        query = f"{brand} {name}".strip()

        # Let backend metadata be the source of truth
        matched_product = lookup_product(query, preferred_type=product_type)
        model_results = find_dupes(query, preferred_type=product_type)
        results = _merge_ranked_candidates(model_results)
        original_firestore = fetch_firestore_product({
            "brand": brand,
            "product_name": name,
            "category": category,
            "subcategory": product_type,
            "type": product_type,
        })
        if original_firestore:
            original_raw = original_firestore.get("raw", {})
            original_price = _first_present(
                original_firestore.get("price"),
                original_raw.get("Price_USD"),
                original_raw.get("price"),
                original_raw.get("salePrice"),
                original_raw.get("current_price"),
                price,
            )
            original_record = {**original_firestore, "price": original_price}
            original = _product_from_record(
                original_record,
                fallback={
                    "id": original_firestore.get("firestore_id", ""),
                    "image": image,
                },
                enrich_image=True,
            )
            original = _finalize_product(original, require_image=False)
        else:
            original = _finalize_product({
                "id": f"{brand}-{name}".lower().replace(" ", "-"),
                "name": name,
                "brand": brand,
                "price": _normalize_price(price),
                "image": image,
                "rating": 0,
                "category": category or (matched_product or {}).get("category", "") or "",
                "productType": normalize_product_type(product_type or (matched_product or {}).get("subcategory", "") or (matched_product or {}).get("type", "") or ""),
                "countryOfOrigin": "",
                "crueltyFree": "",
                "genderTarget": "",
                "mainIngredient": "",
                "numberOfReviews": 0,
                "packagingType": "",
                "productSize": "",
                "skinType": "",
                "raw": {},
            }, require_image=False)
        original = _resolve_live_product(original) or original

        if not original:
            raise HTTPException(status_code=404, detail="Product not found")

        output = []

        for item in results:
            ranked_record = item.get("record", {})
            firestore_record = fetch_firestore_product(ranked_record)
            dupe_source = firestore_record or ranked_record
            dupe = _product_from_record(
                dupe_source,
                fallback={
                    "id": ranked_record.get("firestore_id", ""),
                    "image": "",
                },
                enrich_image=True,
            )
            dupe = _finalize_product(dupe, require_image=False)
            dupe = _resolve_live_product(dupe) or dupe
            if not dupe:
                continue
            savings = max(original["price"] - dupe["price"], 0)
            similarity = _compute_match_percentage(
                original_firestore or original,
                firestore_record or dupe_source,
            )
            match_reason = _build_match_reason(
                original_firestore or original,
                firestore_record or dupe_source,
            )
            if similarity < 45:
                continue

            output.append({
                "id": f"dupe-{len(output)}",
                "original": original,
                "dupe": dupe,
                "similarity": similarity,
                "matchReason": match_reason,
                "savings": savings,
            })
        output = [
            item for item in output
            if _product_identity_key(item["original"]) != _product_identity_key(item["dupe"])
        ]
        deduped_output = []
        seen_output = set()
        for item in output:
            key = _product_identity_key(item["dupe"])
            if key in seen_output:
                continue
            seen_output.add(key)
            deduped_output.append(item)
        deduped_output.sort(
            key=lambda item: (
                -item["similarity"],
                item["savings"] <= 0,
                -item["savings"],
                item["dupe"]["price"] <= 0,
                item["dupe"]["price"],
            )
        )
        return _cache_set(cache_key, deduped_output[:8])

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
