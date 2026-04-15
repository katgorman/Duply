from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parent / ".env")

from firestore_products import (
    fetch_firestore_product,
    get_firestore_product_by_id,
    list_products_by_category,
    normalize_product_type,
    search_firestore_products,
)
from recommendation_system import find_dupes, get_recommendation_status, lookup_product
from web_products import find_price_matches, find_product_image, get_web_product_by_id, search_web_products

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


def _wants_new_products(query):
    normalized = _normalize_text(query)
    return any(token in normalized for token in ["2025", "2026", "new", "latest", "released", "launch"])


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

    if original["price"] > 0 and dupe["price"] > 0:
        relative_diff = abs(original["price"] - dupe["price"]) / max(original["price"], dupe["price"])
        if relative_diff <= 0.15:
            reasons.append("very close price")
        elif relative_diff <= 0.35:
            reasons.append("similar price")

    if original["rating"] > 0 and dupe["rating"] > 0 and abs(original["rating"] - dupe["rating"]) <= 0.5:
        reasons.append("similar rating")

    if not reasons:
        return "Matched on closest overall product attributes"

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
    local_results = search_firestore_products(q, limit=20)
    include_web_results = _wants_new_products(q)
    web_results = search_web_products(q, limit=8) if include_web_results else []

    seen = set()
    combined = []
    ordered_results = [*web_results, *local_results] if include_web_results else local_results
    for product in ordered_results:
        key = (
            _normalize_text(product.get("brand")),
            _normalize_text(product.get("product_name")),
        )
        if key in seen:
            continue
        seen.add(key)
        combined.append(_product_from_record(product, fallback={"id": product.get("firestore_id", "")}))

    return combined[:28]


@app.get("/products/category/{category_or_type}")
def get_products_by_category(category_or_type: str):
    results = list_products_by_category(category_or_type, limit=200)
    return [
        _product_from_record(
            product,
            fallback={"id": product.get("firestore_id", "")},
            enrich_image=index < 12,
        )
        for index, product in enumerate(results)
    ]


@app.get("/products/{product_id}")
def get_product(product_id: str):
    if product_id.startswith("web-"):
        product = get_web_product_by_id(product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Web product expired from cache")
        return _product_from_record(product, fallback={"id": product.get("firestore_id", "")}, enrich_image=True)

    product = get_firestore_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return _product_from_record(product, fallback={"id": product.get("firestore_id", "")}, enrich_image=True)


@app.post("/products/price-matches")
async def get_price_matches(request: Request):
    try:
        body = await request.json()
        brand = body.get("brand", "")
        name = body.get("name", "")

        if not name:
            raise HTTPException(status_code=400, detail="Product name is required")

        return find_price_matches(brand, name, limit=8)
    except HTTPException:
        raise
    except Exception as e:
        print("Error in /products/price-matches:", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/dupes")
async def get_dupes(request: Request):
    try:
        body = await request.json()
        print("RAW request body:", body)

        # Only trust these fields from the frontend
        brand = body.get("brand", "")
        name = body.get("name", "")
        price = body.get("price", 0) or 0
        image = body.get("image", "") or ""
        category = body.get("category", "") or ""
        product_type = body.get("productType", "") or ""

        query = f"{brand} {name}".strip()

        # Let backend metadata be the source of truth
        matched_product = lookup_product(query, preferred_type=product_type)
        results = find_dupes(query, preferred_type=product_type)
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
        else:
            original = {
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
            }

        output = []

        for i, item in enumerate(results):
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
            savings = max(original["price"] - dupe["price"], 0)
            similarity = _compute_match_percentage(
                original_firestore or original,
                firestore_record or dupe_source,
            )
            match_reason = _build_match_reason(
                original_firestore or original,
                firestore_record or dupe_source,
            )

            output.append({
                "id": f"dupe-{i}",
                "original": original,
                "dupe": dupe,
                "similarity": similarity,
                "matchReason": match_reason,
                "savings": savings,
            })

        print("Returning dupes to frontend:", output)
        return output

    except Exception as e:
        print("Error in /dupes:", str(e))
        raise HTTPException(status_code=500, detail=str(e))
