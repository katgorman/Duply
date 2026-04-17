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
    get_firestore_product_by_id,
    list_products_by_category,
    normalize_product_type,
    search_firestore_products,
)
from recommendation_system import find_dupes, get_recommendation_status, lookup_product
from web_products import (
    discover_live_category_products,
    find_price_matches,
    find_product_image,
    find_live_dupe_candidates,
    get_web_product_by_id,
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


def _finalize_product(product):
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
    if not normalized["image"]:
        return None

    return normalized


def _dedupe_products(products):
    deduped = []
    seen = set()

    for product in products:
        finalized = _finalize_product(product)
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
                _product_from_record(candidate, fallback={"id": candidate.get("firestore_id", "")})
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


def _directly_available_product(record, fallback=None, enrich_image=False):
    fallback = fallback or {"id": record.get("firestore_id", "")}
    normalized_product = _finalize_product(
        _product_from_record(record, fallback=fallback, enrich_image=enrich_image)
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


@app.get("/health")
def health():
    return {"ok": True, **get_recommendation_status()}


@app.get("/products/search")
def search_products(q: str):
    cache_key = ("search", _normalize_text(q))
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    local_results = search_firestore_products(q, limit=20)
    web_results = search_web_products(q, limit=12)

    seen = set()
    combined = []

    # Web search results are already filtered to live products, so prefer them for fast suggestions.
    for product in web_results:
        key = (
            _normalize_text(product.get("brand")),
            _normalize_text(product.get("product_name")),
        )
        if key in seen:
            continue
        seen.add(key)
        normalized_product = _finalize_product(
            _product_from_record(product, fallback={"id": product.get("firestore_id", "")})
        )
        if not normalized_product:
            continue
        combined.append(normalized_product)
        if len(combined) >= 12:
            return _cache_set(cache_key, _dedupe_products(combined)[:28])

    # For local catalog matches, only keep directly available products here.
    # Deep live-resolution is reserved for the selected-product flow to keep search responsive.
    for product in local_results[:10]:
        key = (
            _normalize_text(product.get("brand")),
            _normalize_text(product.get("product_name")),
        )
        if key in seen:
            continue
        seen.add(key)
        normalized_product = _directly_available_product(
            product,
            fallback={"id": product.get("firestore_id", "")},
        )
        if not normalized_product:
            continue
        combined.append(normalized_product)
        if len(combined) >= 12:
            break

    return _cache_set(cache_key, _dedupe_products(combined)[:28])


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
    live_results = discover_live_category_products(category_or_type, limit=max(page_size, 24)) if page == 1 and not q.strip() else []
    available_items = []
    for index, product in enumerate(result["items"]):
        normalized_product = _coerce_to_live_product(
            product,
            fallback={"id": product.get("firestore_id", "")},
            enrich_image=index < 8,
        )
        if not _is_product_available(normalized_product):
            continue
        available_items.append(normalized_product)

    for product in live_results:
        normalized_product = _coerce_to_live_product(
            product,
            fallback={"id": product.get("firestore_id", "")},
            enrich_image=False,
        )
        if not _is_product_available(normalized_product):
            continue
        if any(
            _normalize_text(existing.get("brand")) == _normalize_text(normalized_product.get("brand"))
            and _normalize_text(existing.get("name")) == _normalize_text(normalized_product.get("name"))
            for existing in available_items
        ):
            continue
        available_items.append(normalized_product)
        if len(available_items) >= page_size:
            break

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
        normalized_product = _coerce_to_live_product(
            product,
            fallback={"id": product.get("firestore_id", "")},
            enrich_image=index < 8,
        )
        if not _is_product_available(normalized_product):
            continue
        available_items.append(normalized_product)
    return _dedupe_products(available_items)


@app.post("/products/price-matches")
async def get_price_matches(request: Request):
    try:
        body = await request.json()
        brand = body.get("brand", "")
        name = body.get("name", "")

        if not name:
            raise HTTPException(status_code=400, detail="Product name is required")

        cache_key = ("price_matches", _normalize_text(brand), _normalize_text(name))
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

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

    if product_id.startswith("web-"):
        product = get_web_product_by_id(product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Web product expired from cache")
        normalized_product = _coerce_to_live_product(
            product,
            fallback={"id": product.get("firestore_id", "")},
            enrich_image=True,
        )
        if not _is_product_available(normalized_product):
            raise HTTPException(status_code=404, detail="Product is no longer available")
        return _cache_set(cache_key, normalized_product)

    product = get_firestore_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    normalized_product = _coerce_to_live_product(
        product,
        fallback={"id": product.get("firestore_id", "")},
        enrich_image=True,
    )
    if not _is_product_available(normalized_product):
        raise HTTPException(status_code=404, detail="Product is no longer available")
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
        live_results = [
            {"record": candidate, "score": 0.0}
            for candidate in find_live_dupe_candidates(
                brand=brand,
                product_name=name,
                product_type=product_type,
                category=category,
                price=price,
                limit=20,
            )
        ]
        results = _merge_ranked_candidates(model_results, live_results)
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
            original = _finalize_product(original)
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
            })
        original = _resolve_live_product(original)

        if not original or not _is_product_available(original):
            raise HTTPException(status_code=404, detail="Product is no longer available")

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
            dupe = _finalize_product(dupe)
            dupe = _resolve_live_product(dupe)
            if not dupe or not _is_product_available(dupe):
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
