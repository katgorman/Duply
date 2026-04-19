from pathlib import Path
import hashlib
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parent / ".env")

from firestore_products import (
    build_catalog_dedupe_key,
    category_counts,
    delete_firestore_products,
    fetch_firestore_product,
    get_admin_job_state,
    get_firestore_status,
    get_firestore_product_by_id,
    list_firestore_product_documents,
    list_products_by_category,
    normalize_catalog_price,
    normalize_text,
    normalize_product_type,
    search_firestore_products,
    set_admin_job_state,
    upsert_firestore_products,
    warm_catalog_cache,
)
from recommendation_system import find_dupes, get_recommendation_status, lookup_product
from web_products import (
    augment_official_us_retailers,
    augment_firestore_catalog_with_top_brands,
    augment_firestore_catalog_with_top_brands_slice,
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


@app.on_event("startup")
def _warm_catalog_on_startup():
    try:
        warm_catalog_cache()
    except Exception:
        # Best-effort warmup only. Requests should still work if warmup fails.
        pass

RESPONSE_CACHE_TTL_SECONDS = 300
ADMIN_JOB_DEFAULT_MAX_STEPS = 1
ADMIN_JOB_MAX_STEPS_LIMIT = 25
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
    return normalize_catalog_price(value)


def _slugify(value: str) -> str:
    return (value or "").strip().lower().replace(" ", "-")


def _normalize_text(value):
    if value is None:
        return ""
    return str(value).strip().lower()


GENERIC_NAME_STOPWORDS = {
    "the", "and", "for", "with", "new", "mini", "travel", "size", "set",
    "kit", "makeup", "cosmetics", "beauty", "collection",
}
SHADE_MARKER_TOKENS = {
    "shade", "shades", "color", "colors", "colour", "colours", "hue", "tone",
}


def _normalized_word_tokens(value):
    return re.findall(r"[a-z0-9]+", _normalize_text(value))


def _brandless_name_tokens(name: str, brand: str = ""):
    brand_tokens = {token for token in _normalized_word_tokens(brand) if token}
    tokens = []
    for token in _normalized_word_tokens(name):
        if token in brand_tokens:
            continue
        tokens.append(token)
    return tokens


def _shared_prefix_length(tokens_a, tokens_b):
    count = 0
    for left, right in zip(tokens_a, tokens_b):
        if left != right:
            break
        count += 1
    return count


def _explicit_family_name_tokens(name: str, brand: str = ""):
    normalized_name = _normalize_text(name)
    if not normalized_name:
        return ()

    normalized_name = re.sub(
        r"\((?:[^)]*?(?:shade|color|colour|hue|tone)[^)]*?)\)",
        "",
        normalized_name,
        flags=re.IGNORECASE,
    )
    normalized_name = re.sub(
        r"\s+(?:in\s+)?(?:shade|color|colour|hue|tone)s?\s+.+$",
        "",
        normalized_name,
        flags=re.IGNORECASE,
    )
    normalized_name = re.sub(r"\s[-:|/]\s.+$", "", normalized_name)

    return tuple(_brandless_name_tokens(normalized_name, brand))


def _is_same_product_family_variant(original_source, dupe_source):
    original = _build_comparison_profile(original_source)
    dupe = _build_comparison_profile(dupe_source)

    original_brand = _normalize_text(original.get("brand"))
    dupe_brand = _normalize_text(dupe.get("brand"))
    if not original_brand or original_brand != dupe_brand:
        return False

    original_type = normalize_product_type(original.get("product_type") or original.get("category"))
    dupe_type = normalize_product_type(dupe.get("product_type") or dupe.get("category"))
    if original_type and dupe_type and original_type != dupe_type:
        return False

    original_tokens = _brandless_name_tokens(original.get("name"), original.get("brand"))
    dupe_tokens = _brandless_name_tokens(dupe.get("name"), dupe.get("brand"))
    if len(original_tokens) < 3 or len(dupe_tokens) < 3:
        return False

    if original_tokens == dupe_tokens:
        return True

    explicit_original_family = _explicit_family_name_tokens(original.get("name"), original.get("brand"))
    explicit_dupe_family = _explicit_family_name_tokens(dupe.get("name"), dupe.get("brand"))
    if (
        explicit_original_family
        and explicit_original_family == explicit_dupe_family
        and explicit_original_family != tuple(original_tokens)
        and explicit_dupe_family != tuple(dupe_tokens)
    ):
        return True

    shared_prefix = _shared_prefix_length(original_tokens, dupe_tokens)
    min_length = min(len(original_tokens), len(dupe_tokens))
    original_suffix = original_tokens[shared_prefix:]
    dupe_suffix = dupe_tokens[shared_prefix:]
    if not original_suffix or not dupe_suffix:
        return False

    if shared_prefix < max(3, min_length - 2):
        return False

    if len(original_suffix) > 2 or len(dupe_suffix) > 2:
        return False

    blocked_suffix_tokens = GENERIC_NAME_STOPWORDS | SHADE_MARKER_TOKENS
    if any(token in blocked_suffix_tokens for token in [*original_suffix, *dupe_suffix]):
        return False

    original_price = _normalize_price(original.get("price"))
    dupe_price = _normalize_price(dupe.get("price"))
    if original_price > 0 and dupe_price > 0:
        relative_diff = abs(original_price - dupe_price) / max(original_price, dupe_price)
        if relative_diff > 0.35:
            return False

    return True


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

    if _is_same_product_family_variant(original_source, dupe_source):
        return 0.0

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

    if _is_same_product_family_variant(original_source, dupe_source):
        return "Same product family in a different shade"

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
        return ""

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
    merchant_offers = record.get("merchantOffers") or raw.get("merchantOffers") or []
    offer_image = ""
    for offer in merchant_offers:
        if isinstance(offer, dict) and offer.get("image"):
            offer_image = str(offer.get("image") or "").strip()
            if offer_image:
                break
    image = record.get("image") or raw.get("image") or raw.get("imageUrl") or offer_image or fallback.get("image", "")
    product_url = record.get("title-href") or raw.get("productUrl") or raw.get("title-href") or ""
    if enrich_image and not image:
        image = find_product_image(brand, name, product_url)
        if image and explicit_id:
            try:
                upsert_firestore_products([{
                    "id": explicit_id,
                    "brand": brand,
                    "product_name": name,
                    "category": category,
                    "type": product_type,
                    "price": record.get("price") if record.get("price") is not None else fallback.get("price"),
                    "rating": record.get("rating") if record.get("rating") is not None else fallback.get("rating"),
                    "image": image,
                    "productUrl": product_url,
                    "source": record.get("source") or raw.get("source") or "catalog",
                    "raw": {**raw, "productUrl": product_url or raw.get("productUrl") or raw.get("title-href") or ""},
                }])
            except Exception:
                pass

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
    return build_catalog_dedupe_key({
        "brand": product.get("brand"),
        "name": product.get("name"),
        "productType": product.get("productType") or product.get("category"),
    })


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


def _ensure_product_image(product):
    if not product:
        return None
    if product.get("image"):
        return product

    product_url = product.get("productUrl") or ""
    if not product_url:
        return product

    image = find_product_image(product.get("brand"), product.get("name"), product_url)
    if not image:
        return product

    enriched = {
        **product,
        "image": image,
    }
    try:
        upsert_firestore_products([{
            "id": enriched.get("id"),
            "brand": enriched.get("brand"),
            "product_name": enriched.get("name"),
            "category": enriched.get("category"),
            "type": enriched.get("productType"),
            "price": enriched.get("price"),
            "rating": enriched.get("rating"),
            "image": image,
            "productUrl": enriched.get("productUrl"),
            "source": enriched.get("source") or "catalog",
        }])
    except Exception:
        pass

    return enriched


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


def _dupe_query_tokens(brand: str, name: str):
    stopwords = {
        "the", "and", "for", "with", "new", "mini", "travel", "shade",
        "beauty", "rare", "makeup", "cosmetics", "product", "stick",
    }
    excluded = {token for token in re.findall(r"[a-z0-9]+", _normalize_text(brand)) if token}
    tokens = []
    for token in re.findall(r"[a-z0-9]+", _normalize_text(name)):
        if len(token) <= 2 or token in stopwords or token in excluded:
            continue
        tokens.append(token)
    return tokens


def _fallback_dupe_record_score(original_product, candidate_product, name_tokens):
    score = 0.0
    original_type = normalize_product_type(original_product.get("productType") or original_product.get("category"))
    candidate_type = normalize_product_type(candidate_product.get("productType") or candidate_product.get("category"))
    if original_type and candidate_type == original_type:
        score += 35

    original_category = _normalize_text(original_product.get("category"))
    candidate_category = _normalize_text(candidate_product.get("category"))
    if original_category and candidate_category == original_category:
        score += 10

    candidate_name = _normalize_text(candidate_product.get("name"))
    token_matches = sum(1 for token in name_tokens if token in candidate_name)
    if name_tokens:
        score += (token_matches / len(name_tokens)) * 35

    original_price = _normalize_price(original_product.get("price"))
    candidate_price = _normalize_price(candidate_product.get("price"))
    if original_price > 0 and candidate_price > 0:
        relative_diff = abs(original_price - candidate_price) / max(original_price, candidate_price)
        score += max(0, 1 - relative_diff) * 20

    if _normalize_text(original_product.get("brand")) == _normalize_text(candidate_product.get("brand")):
        score -= 20

    return round(score, 3)


def _dupe_quality_score(product):
    if not product:
        return 0

    score = 0.0
    if product.get("image"):
        score += 12
    if product.get("productUrl"):
        score += 12
    if _normalize_text(product.get("source")) == "catalog":
        score += 8

    reviews = _normalize_number(product.get("numberOfReviews"), 0)
    rating = _normalize_number(product.get("rating"), 0)
    price = _normalize_price(product.get("price"))

    score += min(reviews, 500) / 25
    score += rating * 3
    if price > 0:
        score += 4

    return round(score, 2)


def _fallback_dupe_candidates(original_product, brand: str, name: str, product_type: str, category: str, limit: int = 20):
    if not original_product:
        return []

    seen = set()
    candidates = []
    name_tokens = _dupe_query_tokens(brand, name)
    target_bucket = product_type or category
    source_records = []

    if target_bucket:
        try:
            category_page = list_products_by_category(target_bucket, limit=80, page=1)
            source_records.extend(category_page.get("items") or [])
        except Exception:
            pass

    for query in filter(None, [name, f"{brand} {name}".strip(), " ".join(name_tokens[:3]).strip()]):
        try:
            source_records.extend(search_firestore_products(query, limit=30))
        except Exception:
            continue

    for record in source_records:
        candidate = _coerce_to_display_product(
            record,
            fallback={"id": record.get("firestore_id", "")},
            enrich_image=False,
        )
        if not candidate:
            continue
        if _is_same_product_family_variant(original_product, candidate):
            continue
        identity = _product_identity_key(candidate)
        if identity == _product_identity_key(original_product) or identity in seen:
            continue
        seen.add(identity)

        score = _fallback_dupe_record_score(original_product, candidate, name_tokens)
        if score < 35:
            continue

        candidates.append({
            "record": {
                "brand": candidate.get("brand"),
                "product_name": candidate.get("name"),
                "category": candidate.get("category"),
                "subcategory": candidate.get("productType"),
                "type": candidate.get("productType"),
                "price": candidate.get("price"),
                "rating": candidate.get("rating"),
                "image": candidate.get("image"),
                "firestore_id": candidate.get("id"),
                "raw": {
                    "productUrl": candidate.get("productUrl") or "",
                    "source": candidate.get("source") or "catalog",
                },
            },
            "score": score,
        })

    candidates.sort(
        key=lambda item: (
            -item.get("score", 0),
            _normalize_text(item.get("record", {}).get("brand")),
            _normalize_text(item.get("record", {}).get("product_name")),
        )
    )
    return candidates[:limit]


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

    if web_limit > 0 and len(combined) < max_results:
        remaining = max_results - len(combined)
        live_results = search_web_products(q, limit=min(web_limit, remaining))
        for product in live_results:
            normalized_product = _search_ready_product(
                product,
                fallback={"id": product.get("firestore_id", "")},
            )
            if not normalized_product:
                continue
            key = (
                _normalize_text(normalized_product.get("brand")),
                _normalize_text(normalized_product.get("name")),
            )
            if key in seen:
                continue
            seen.add(key)
            combined.append(normalized_product)
            if len(combined) >= max_results:
                break

    return _dedupe_products(combined, require_image=False)[:max_results]


def _search_products_with_fallback(q: str, local_limit: int, web_limit: int, max_results: int = 120):
    combined = _search_products_once(q, local_limit=local_limit, web_limit=web_limit, max_results=max_results)
    if combined or not _is_likely_brand_query(q):
        return combined

    fallback_results = []
    for suffix in SEARCH_FALLBACK_SUFFIXES:
        fallback_query = f"{q} {suffix}".strip()
        fallback_results.extend(
            _search_products_once(
                fallback_query,
                local_limit=max(12, local_limit // 2),
                web_limit=web_limit,
                max_results=max_results,
            )
        )
        if len(fallback_results) >= max_results:
            break

    return _dedupe_products(fallback_results, require_image=False)[:max_results]


def _offer_identity_key(offer):
    return (
        _normalize_text(offer.get("retailer")),
        _normalize_text(offer.get("title")),
        _normalize_text(offer.get("url")),
    )


def _normalize_price_offer(offer, brand="", name=""):
    url = str(offer.get("url") or "").strip()
    title = str(offer.get("title") or f"{brand} {name}".strip()).strip()
    price = _normalize_price(offer.get("price"))
    if not url or price <= 0:
        return None
    if not is_approved_retailer_url(url) or not is_live_product_url(url):
        return None
    return {
        "id": offer.get("id") or f"offer-{abs(hash((title, url))) % 10**12}",
        "retailer": offer.get("retailer") or "",
        "title": title,
        "price": price,
        "url": url,
        "image": offer.get("image") or "",
        "shipping": offer.get("shipping") or "",
        "source": offer.get("source") or "catalog",
        "matchConfidence": int(offer.get("matchConfidence") or title_match_confidence(title, brand, name)),
    }


def _catalog_price_matches(brand: str, name: str, limit: int = 12):
    offers = []
    seen = set()
    query = f"{brand} {name}".strip()

    for record in search_firestore_products(query, limit=max(limit * 10, 40)):
        product = _coerce_to_display_product(
            record,
            fallback={"id": record.get("firestore_id", "")},
            enrich_image=False,
        )
        if not product or not product.get("productUrl"):
            continue

        confidence = title_match_confidence(product.get("name"), brand, name)
        if confidence < 50:
            continue

        normalized_offer = _normalize_price_offer({
            "id": f"catalog-{product.get('id')}",
            "retailer": record.get("source") or record.get("website") or product.get("source") or "catalog",
            "title": product.get("name"),
            "price": product.get("price"),
            "url": product.get("productUrl"),
            "image": product.get("image"),
            "source": record.get("source") or "catalog",
            "matchConfidence": confidence,
        }, brand=brand, name=name)
        if not normalized_offer:
            continue

        key = _offer_identity_key(normalized_offer)
        if key in seen:
            continue
        seen.add(key)
        offers.append(normalized_offer)

    offers.sort(
        key=lambda offer: (
            normalize_text(offer.get("retailer")) not in {"sephora", "ulta", "ulta beauty"},
            offer.get("price", 0),
            -(offer.get("matchConfidence") or 0),
            normalize_text(offer.get("retailer")),
        )
    )
    return offers[:limit]


def _merge_price_offers(*offer_groups, brand="", name="", limit=3):
    merged = []
    seen = set()
    for group in offer_groups:
        for offer in group or []:
            normalized_offer = _normalize_price_offer(offer, brand=brand, name=name)
            if not normalized_offer:
                continue
            key = _offer_identity_key(normalized_offer)
            if key in seen:
                continue
            seen.add(key)
            merged.append(normalized_offer)

    merged.sort(
        key=lambda offer: (
            normalize_text(offer.get("retailer")) not in {"sephora", "ulta", "ulta beauty"},
            offer.get("price", 0),
            -(offer.get("matchConfidence") or 0),
            normalize_text(offer.get("retailer")),
        )
    )
    return merged[:limit]


def _catalog_url_fallback_offer(product, brand="", name="", fallback_url=""):
    if not product:
        return None

    raw = (product.get("raw") or {}) if isinstance(product.get("raw"), dict) else {}
    url = str(
        product.get("productUrl")
        or raw.get("productUrl")
        or raw.get("title-href")
        or fallback_url
        or ""
    ).strip()
    if not url:
        return None

    price = _normalize_price(product.get("price"))
    if price <= 0:
        return None

    retailer = (
        str(product.get("source") or raw.get("source") or "").strip()
        or (url.split("/")[2] if "://" in url else "catalog")
    )

    return {
        "id": f"catalog-fallback-{product.get('firestore_id') or product.get('id') or abs(hash((url, price))) % 10**12}",
        "retailer": retailer,
        "title": str(product.get("product_name") or product.get("name") or f"{brand} {name}".strip()).strip(),
        "price": price,
        "url": url,
        "image": str(product.get("image") or raw.get("image") or "").strip(),
        "shipping": "",
        "source": "catalog-fallback",
        "matchConfidence": 100,
    }


def _cleanup_candidate_urls(data):
    raw = data.get("raw", {}) if isinstance(data.get("raw"), dict) else {}
    urls = []
    for candidate in [
        data.get("productUrl"),
        data.get("title-href"),
        raw.get("productUrl"),
        raw.get("title-href"),
    ]:
        url = str(candidate or "").strip()
        if url and is_approved_retailer_url(url):
            urls.append(url)

    for offer in (data.get("merchantOffers") or raw.get("merchantOffers") or []):
        if not isinstance(offer, dict):
            continue
        url = str(offer.get("url") or "").strip()
        if url and is_approved_retailer_url(url):
            urls.append(url)

    deduped = []
    seen = set()
    for url in urls:
        key = _normalize_text(url)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(url)
    return deduped


def _prepare_cleanup_doc(doc):
    data = doc.to_dict() or {}
    raw = data.get("raw", {}) if isinstance(data.get("raw"), dict) else {}
    brand = str(data.get("Brand") or data.get("brand") or "").strip()
    name = str(
        data.get("Product_Name")
        or data.get("product_name")
        or data.get("name")
        or data.get("title")
        or ""
    ).strip()
    category = str(data.get("Category") or data.get("category") or data.get("main_category") or "").strip()
    product_type = normalize_product_type(
        data.get("subcategory") or data.get("productType") or data.get("type") or category
    )
    merchant_offers = [
        offer for offer in (data.get("merchantOffers") or raw.get("merchantOffers") or []) if isinstance(offer, dict)
    ]
    normalized_prices = [
        normalize_catalog_price(value)
        for value in [
            data.get("Price_USD"),
            data.get("price"),
            data.get("salePrice"),
            data.get("current_price"),
        ]
    ]
    for offer in merchant_offers:
        normalized_prices.append(normalize_catalog_price(offer.get("price")))

    return {
        "docId": doc.id,
        "data": data,
        "raw": raw,
        "brand": brand,
        "name": name,
        "category": category or product_type,
        "productType": product_type,
        "image": str(data.get("image") or data.get("imageUrl") or data.get("image_link") or "").strip(),
        "source": str(data.get("sourceProvider") or data.get("source") or "").strip(),
        "rating": _normalize_number(data.get("Rating") or data.get("rating") or data.get("avgRating"), 0),
        "lastSeenAt": int(_normalize_number(data.get("lastSeenAt"), 0)),
        "lastValidatedAt": int(_normalize_number(data.get("lastValidatedAt"), 0)),
        "merchantOffers": merchant_offers,
        "candidateUrls": _cleanup_candidate_urls(data),
        "priceCandidates": [price for price in normalized_prices if price > 0],
        "dedupeKey": build_catalog_dedupe_key({
            "brand": brand,
            "product_name": name,
            "type": product_type,
        }),
    }


def _cleanup_doc_score(item):
    official_domains = {"sephora.com", "ulta.com"}
    live_domains = {
        url.split("/")[2].lower()
        for url in item.get("liveUrls", [])
        if "://" in url
    }
    return (
        100 if item.get("liveUrls") else 0,
        30 if item.get("image") else 0,
        20 if live_domains & official_domains else 0,
        min(len(item.get("liveOfferMap", {})), 4) * 5,
        10 if 0 < item.get("bestPrice", 0) < 500 else 0,
        min(item.get("rating", 0), 5),
        item.get("lastValidatedAt", 0),
        item.get("lastSeenAt", 0),
    )


def _slice_cleanup_docs(docs, max_docs=0, start_after_id=""):
    sorted_docs = sorted(docs or [], key=lambda doc: doc.id)
    if start_after_id:
        sorted_docs = [doc for doc in sorted_docs if doc.id > start_after_id]
    if max_docs and max_docs > 0:
        sorted_docs = sorted_docs[:max_docs]
    return sorted_docs


def cleanup_firestore_catalog(max_docs=0, start_after_id="", validate_images=True):
    docs = _slice_cleanup_docs(
        list_firestore_product_documents(),
        max_docs=max_docs,
        start_after_id=start_after_id,
    )
    if not docs:
        return {
            "scanned": 0,
            "deleted": 0,
            "rewritten": 0,
            "duplicatesRemoved": 0,
            "invalidRemoved": 0,
            "groupsMerged": 0,
            "nextStartAfterId": None,
            "finished": True,
        }

    prepared = []
    for doc in docs:
        item = _prepare_cleanup_doc(doc)
        if not item.get("brand") or not item.get("name") or not item.get("productType"):
            item["invalidReason"] = "missing-core-fields"
        prepared.append(item)

    unique_urls = []
    seen_urls = set()
    for item in prepared:
        for url in item.get("candidateUrls", []):
            key = _normalize_text(url)
            if key in seen_urls:
                continue
            seen_urls.add(key)
            unique_urls.append(url)

    url_status = {}
    if unique_urls:
        with ThreadPoolExecutor(max_workers=12) as executor:
            futures = {executor.submit(is_live_product_url, url): url for url in unique_urls}
            for future in as_completed(futures):
                url = futures[future]
                try:
                    url_status[url] = bool(future.result())
                except Exception:
                    url_status[url] = False

    grouped = {}
    invalid_doc_ids = []
    invalid_removed = 0

    for item in prepared:
        if item.get("invalidReason"):
            invalid_doc_ids.append(item["docId"])
            invalid_removed += 1
            continue

        live_urls = [url for url in item.get("candidateUrls", []) if url_status.get(url)]
        item["liveUrls"] = live_urls
        item["liveOfferMap"] = {}

        for offer in item.get("merchantOffers", []):
            url = str(offer.get("url") or "").strip()
            if not url or not url_status.get(url):
                continue
            normalized_offer = {
                "id": offer.get("id") or f"offer-{abs(hash((item['docId'], url))) % 10**12}",
                "retailer": offer.get("retailer") or item.get("source") or "",
                "title": offer.get("title") or item.get("name"),
                "price": normalize_catalog_price(offer.get("price")),
                "url": url,
                "image": offer.get("image") or item.get("image") or "",
                "shipping": offer.get("shipping") or "",
                "source": offer.get("source") or item.get("source") or "catalog",
                "matchConfidence": int(offer.get("matchConfidence") or 100),
            }
            if normalized_offer["price"] > 0:
                item["liveOfferMap"][url] = normalized_offer

        if not live_urls:
            invalid_doc_ids.append(item["docId"])
            invalid_removed += 1
            continue

        best_price = 0
        if item["liveOfferMap"]:
            best_price = min(offer.get("price", 0) for offer in item["liveOfferMap"].values() if offer.get("price", 0) > 0)
        if best_price <= 0 and item.get("priceCandidates"):
            best_price = min(item["priceCandidates"])
        item["bestPrice"] = best_price
        grouped.setdefault(item["dedupeKey"], []).append(item)

    rewritten_payloads = []
    duplicate_doc_ids = []
    merged_groups = 0

    for _, group in grouped.items():
        if not group:
            continue

        winner = sorted(group, key=_cleanup_doc_score, reverse=True)[0]
        merged_groups += 1 if len(group) > 1 else 0
        live_offers = []
        seen_offer_keys = set()

        for item in sorted(group, key=_cleanup_doc_score, reverse=True):
            for offer in item.get("liveOfferMap", {}).values():
                key = _offer_identity_key(offer)
                if key in seen_offer_keys:
                    continue
                seen_offer_keys.add(key)
                live_offers.append(offer)

        canonical_url = ""
        if winner.get("liveUrls"):
            preferred_url = str(winner["data"].get("productUrl") or winner["raw"].get("productUrl") or "").strip()
            canonical_url = preferred_url if preferred_url in winner["liveUrls"] else winner["liveUrls"][0]

        if canonical_url and canonical_url not in {offer.get("url") for offer in live_offers}:
            fallback_price = winner.get("bestPrice") or min(
                [item.get("bestPrice", 0) for item in group if item.get("bestPrice", 0) > 0] or [0]
            )
            if fallback_price > 0:
                live_offers.append({
                    "id": f"offer-{abs(hash((winner['docId'], canonical_url))) % 10**12}",
                    "retailer": winner.get("source") or "",
                    "title": winner.get("name"),
                    "price": fallback_price,
                    "url": canonical_url,
                    "image": winner.get("image") or "",
                    "shipping": "",
                    "source": winner.get("source") or "catalog",
                    "matchConfidence": 100,
                })

        live_offers.sort(
            key=lambda offer: (
                normalize_text(offer.get("retailer")) not in {"sephora", "ulta", "ulta beauty"},
                offer.get("price", 0) <= 0,
                offer.get("price", 0) if offer.get("price", 0) > 0 else 10**9,
                normalize_text(offer.get("retailer")),
            )
        )

        price = 0
        if live_offers:
            if canonical_url:
                matching_offer = next((offer for offer in live_offers if offer.get("url") == canonical_url and offer.get("price", 0) > 0), None)
                if matching_offer:
                    price = matching_offer["price"]
            if price <= 0:
                price = live_offers[0].get("price", 0)
        if price <= 0:
            price = winner.get("bestPrice", 0)
        if price <= 0:
            invalid_doc_ids.extend(item["docId"] for item in group)
            invalid_removed += len(group)
            continue

        image = winner.get("image") or next((offer.get("image") for offer in live_offers if offer.get("image")), "")
        if validate_images and not image and canonical_url:
            image = find_product_image(winner.get("brand"), winner.get("name"), canonical_url)
        if not image:
            invalid_doc_ids.extend(item["docId"] for item in group)
            invalid_removed += len(group)
            continue

        merged_raw = {
            **winner.get("raw", {}),
            "productUrl": canonical_url,
            "merchantOffers": live_offers,
            "availabilityStatus": "active",
        }
        rewritten_payloads.append({
            "id": winner["docId"],
            "brand": winner.get("brand"),
            "product_name": winner.get("name"),
            "category": winner.get("category"),
            "type": winner.get("productType"),
            "price": price,
            "rating": winner.get("rating", 0),
            "image": image,
            "productUrl": canonical_url,
            "source": winner.get("source") or "catalog",
            "availabilityStatus": "active",
            "merchantOffers": live_offers,
            "merchantDomain": canonical_url.split("/")[2] if "://" in canonical_url else "",
            "lastSeenAt": max(item.get("lastSeenAt", 0) for item in group) or int(time.time()),
            "lastValidatedAt": int(time.time()),
            "raw": merged_raw,
        })

        for item in group:
            if item["docId"] != winner["docId"]:
                duplicate_doc_ids.append(item["docId"])

    delete_result = delete_firestore_products(invalid_doc_ids + duplicate_doc_ids)
    rewrite_result = upsert_firestore_products(rewritten_payloads)

    return {
        "scanned": len(docs),
        "deleted": delete_result.get("deleted", 0),
        "rewritten": rewrite_result.get("written", 0),
        "duplicatesRemoved": len(set(duplicate_doc_ids)),
        "invalidRemoved": invalid_removed,
        "groupsMerged": merged_groups,
        "nextStartAfterId": docs[-1].id if docs else None,
        "finished": not bool(max_docs and len(docs) >= max_docs),
    }


def _job_now():
    return int(time.time())


def _normalize_job_kind(kind):
    return _normalize_text(kind).replace("_", "-")


def _build_admin_job_id(kind, config):
    payload = f"{kind}|{repr(config)}|{int(time.time() * 1000)}"
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:10]
    return f"job-{_normalize_job_kind(kind)}-{digest}"


def _cleanup_job_config(body):
    return {
        "batchSize": max(1, min(int(body.get("batchSize") or body.get("maxDocs") or 50), 200)),
        "validateImages": bool(body.get("validateImages", True)),
    }


def _augment_us_retailers_job_config(body):
    retailers = body.get("retailers") or None
    return {
        "retailers": retailers,
        "batchSizePerRetailer": max(1, min(int(body.get("batchSizePerRetailer") or body.get("maxUrlsPerRetailer") or 25), 100)),
    }


def _augment_top_brands_job_config(body):
    return {
        "brands": body.get("brands") or None,
        "categories": body.get("categories") or None,
        "perQueryLimit": max(1, min(int(body.get("perQueryLimit") or 25), 100)),
        "queriesPerStep": max(1, min(int(body.get("queriesPerStep") or body.get("maxQueries") or 5), 20)),
    }


def _create_admin_job_state(kind, config):
    now = _job_now()
    normalized_kind = _normalize_job_kind(kind)
    state = {
        "jobId": _build_admin_job_id(normalized_kind, config),
        "kind": normalized_kind,
        "status": "queued",
        "createdAt": now,
        "updatedAt": now,
        "startedAt": None,
        "completedAt": None,
        "error": "",
        "config": config,
        "cursor": {},
        "progress": {
            "stepsRun": 0,
        },
        "lastResult": None,
    }

    if normalized_kind == "cleanup-catalog":
        state["cursor"] = {"startAfterId": "", "previousCursor": "", "repeatCount": 0}
        state["progress"].update({
            "scanned": 0,
            "deleted": 0,
            "rewritten": 0,
            "duplicatesRemoved": 0,
            "invalidRemoved": 0,
            "groupsMerged": 0,
        })
    elif normalized_kind == "augment-us-retailers":
        state["cursor"] = {"retailerIndex": 0, "startIndex": 0}
        state["progress"].update({
            "productsFound": 0,
            "written": 0,
            "retailersCompleted": 0,
            "retailerSummaries": {},
        })
    elif normalized_kind == "augment-top-brands":
        state["cursor"] = {"startQueryIndex": 0}
        state["progress"].update({
            "queriesRun": 0,
            "productsFound": 0,
            "written": 0,
            "totalQueries": 0,
        })
    else:
        raise ValueError(f"Unsupported job kind: {kind}")

    return state


def _save_admin_job_state(state):
    state["updatedAt"] = _job_now()
    set_admin_job_state(state["jobId"], state)
    return state


def _load_admin_job_state(job_id):
    state = get_admin_job_state(job_id)
    if not state:
        return None
    return state


def _step_cleanup_job(state):
    cursor = state.get("cursor", {})
    config = state.get("config", {})
    result = cleanup_firestore_catalog(
        max_docs=config.get("batchSize") or 50,
        start_after_id=cursor.get("startAfterId") or "",
        validate_images=bool(config.get("validateImages", True)),
    )

    progress = state["progress"]
    progress["stepsRun"] += 1
    progress["scanned"] += int(result.get("scanned") or 0)
    progress["deleted"] += int(result.get("deleted") or 0)
    progress["rewritten"] += int(result.get("rewritten") or 0)
    progress["duplicatesRemoved"] += int(result.get("duplicatesRemoved") or 0)
    progress["invalidRemoved"] += int(result.get("invalidRemoved") or 0)
    progress["groupsMerged"] += int(result.get("groupsMerged") or 0)

    next_cursor = str(result.get("nextStartAfterId") or "").strip()
    current_cursor = str(cursor.get("startAfterId") or "").strip()
    previous_cursor = str(cursor.get("previousCursor") or "").strip()

    if result.get("finished") or not next_cursor:
        state["status"] = "completed"
        state["completedAt"] = _job_now()
    elif next_cursor == current_cursor or next_cursor == previous_cursor:
        repeat_count = int(cursor.get("repeatCount") or 0) + 1
        state["cursor"] = {
            "startAfterId": current_cursor,
            "previousCursor": previous_cursor,
            "repeatCount": repeat_count,
        }
        state["status"] = "failed"
        state["error"] = "Cleanup cursor repeated; job paused to avoid looping."
    else:
        state["status"] = "running"
        state["cursor"] = {
            "startAfterId": next_cursor,
            "previousCursor": current_cursor,
            "repeatCount": 0,
        }

    state["lastResult"] = result
    return state


def _step_augment_us_retailers_job(state):
    config = state.get("config", {})
    cursor = state.get("cursor", {})
    selected_retailers = config.get("retailers") or ["sephora", "ulta"]
    retailer_index = max(0, int(cursor.get("retailerIndex") or 0))
    start_index = max(0, int(cursor.get("startIndex") or 0))

    if retailer_index >= len(selected_retailers):
        state["status"] = "completed"
        state["completedAt"] = _job_now()
        state["lastResult"] = {
            "finished": True,
            "retailerIndex": retailer_index,
            "startIndex": start_index,
        }
        return state

    retailer = selected_retailers[retailer_index]
    result = augment_official_us_retailers(
        retailers=[retailer],
        max_urls_per_retailer=config.get("batchSizePerRetailer") or 25,
        start_index=start_index,
    )

    progress = state["progress"]
    progress["stepsRun"] += 1
    progress["productsFound"] += int(result.get("productsFound") or 0)
    progress["written"] += int((result.get("firestore") or {}).get("written") or 0)
    retailer_summary = ((result.get("retailers") or [{}])[0] if result.get("retailers") else {})
    progress["retailerSummaries"][retailer] = retailer_summary

    urls_discovered = int(retailer_summary.get("urlsDiscovered") or 0)
    urls_processed = int(retailer_summary.get("urlsProcessed") or 0)
    next_start_index = int(retailer_summary.get("nextStartIndex") or (start_index + urls_processed))
    retailer_complete = urls_processed <= 0 or (urls_discovered > 0 and next_start_index >= urls_discovered)

    if retailer_complete:
        retailer_index += 1
        start_index = 0
        progress["retailersCompleted"] = max(progress.get("retailersCompleted", 0), retailer_index)
    else:
        start_index = next_start_index

    if retailer_index >= len(selected_retailers):
        state["status"] = "completed"
        state["completedAt"] = _job_now()
    else:
        state["status"] = "running"
    state["cursor"] = {
        "retailerIndex": retailer_index,
        "startIndex": start_index,
    }
    state["lastResult"] = result
    return state


def _step_augment_top_brands_job(state):
    config = state.get("config", {})
    cursor = state.get("cursor", {})
    result = augment_firestore_catalog_with_top_brands_slice(
        brands=config.get("brands"),
        categories=config.get("categories"),
        per_query_limit=config.get("perQueryLimit") or 25,
        start_query_index=cursor.get("startQueryIndex") or 0,
        max_queries=config.get("queriesPerStep") or 5,
    )

    progress = state["progress"]
    progress["stepsRun"] += 1
    progress["queriesRun"] += int(result.get("queriesRun") or 0)
    progress["productsFound"] += int(result.get("productsFound") or 0)
    progress["written"] += int((result.get("firestore") or {}).get("written") or 0)
    progress["totalQueries"] = int(result.get("totalQueries") or progress.get("totalQueries") or 0)

    if result.get("finished"):
        state["status"] = "completed"
        state["completedAt"] = _job_now()
    else:
        next_query_index = int(result.get("nextQueryIndex") or 0)
        current_query_index = int(cursor.get("startQueryIndex") or 0)
        if next_query_index <= current_query_index:
            state["status"] = "failed"
            state["error"] = "Top-brand augmentation query cursor did not advance."
        else:
            state["status"] = "running"
            state["cursor"] = {"startQueryIndex": next_query_index}

    state["lastResult"] = result
    return state


def _run_admin_job_step(state):
    kind = _normalize_job_kind(state.get("kind"))
    if kind == "cleanup-catalog":
        return _step_cleanup_job(state)
    if kind == "augment-us-retailers":
        return _step_augment_us_retailers_job(state)
    if kind == "augment-top-brands":
        return _step_augment_top_brands_job(state)
    raise ValueError(f"Unsupported job kind: {kind}")


def run_admin_job(job_id, max_steps=ADMIN_JOB_DEFAULT_MAX_STEPS):
    state = _load_admin_job_state(job_id)
    if not state:
        raise KeyError(job_id)

    safe_max_steps = max(1, min(int(max_steps or ADMIN_JOB_DEFAULT_MAX_STEPS), ADMIN_JOB_MAX_STEPS_LIMIT))
    if state.get("status") == "completed":
        return state
    if state.get("status") == "failed":
        return state

    if not state.get("startedAt"):
        state["startedAt"] = _job_now()

    for _ in range(safe_max_steps):
        state["status"] = "running"
        state["error"] = ""
        try:
            state = _run_admin_job_step(state)
        except Exception as exc:
            state["status"] = "failed"
            state["error"] = str(exc)
            state["lastResult"] = None
        _save_admin_job_state(state)
        if state.get("status") in {"completed", "failed"}:
            break

    return state


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


@app.post("/admin/jobs")
async def create_admin_job(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    kind = _normalize_job_kind(body.get("kind") or "")
    if kind == "cleanup-catalog":
        config = _cleanup_job_config(body)
    elif kind == "augment-us-retailers":
        config = _augment_us_retailers_job_config(body)
    elif kind == "augment-top-brands":
        config = _augment_top_brands_job_config(body)
    else:
        raise HTTPException(status_code=400, detail="Unsupported job kind")

    state = _create_admin_job_state(kind, config)
    _save_admin_job_state(state)

    max_steps = int(body.get("maxSteps") or 0)
    if max_steps > 0:
        state = run_admin_job(state["jobId"], max_steps=max_steps)

    return state


@app.get("/admin/jobs/{job_id}")
def get_admin_job(job_id: str):
    state = _load_admin_job_state(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")
    return state


@app.post("/admin/jobs/{job_id}/run")
async def run_existing_admin_job(job_id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    state = _load_admin_job_state(job_id)
    if not state:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        return run_admin_job(job_id, max_steps=body.get("maxSteps") or ADMIN_JOB_DEFAULT_MAX_STEPS)
    except KeyError:
        raise HTTPException(status_code=404, detail="Job not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/augment-top-brands")
async def augment_top_brands(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    brands = body.get("brands") or None
    categories = body.get("categories") or None
    per_query_limit = max(1, min(int(body.get("perQueryLimit") or 40), 100))
    start_query_index = max(0, int(body.get("startQueryIndex") or 0))
    max_queries = max(1, min(int(body.get("maxQueries") or 0), 25)) if body.get("maxQueries") is not None else 0

    try:
        if max_queries:
            return augment_firestore_catalog_with_top_brands_slice(
                brands=brands,
                categories=categories,
                per_query_limit=per_query_limit,
                start_query_index=start_query_index,
                max_queries=max_queries,
            )
        result = augment_firestore_catalog_with_top_brands(
            brands=brands,
            categories=categories,
            per_query_limit=per_query_limit,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/augment-us-retailers")
async def augment_us_retailers(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    retailers = body.get("retailers") or None
    max_urls_per_retailer = max(0, int(body.get("maxUrlsPerRetailer") or 0))
    start_index = max(0, int(body.get("startIndex") or 0))

    try:
        return augment_official_us_retailers(
            retailers=retailers,
            max_urls_per_retailer=max_urls_per_retailer,
            start_index=start_index,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/admin/cleanup-catalog")
async def cleanup_catalog(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    max_docs = max(0, int(body.get("maxDocs") or 0))
    start_after_id = str(body.get("startAfterId") or "").strip()
    validate_images = bool(body.get("validateImages", True))

    try:
        return cleanup_firestore_catalog(
            max_docs=max_docs,
            start_after_id=start_after_id,
            validate_images=validate_images,
        )
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
        web_limit=max(8, normalized_limit * 2),
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
        web_limit=min(max(24, normalized_page_size * 2), target_count),
        max_results=target_count,
    )
    combined.sort(key=lambda product: _product_sort_key(product, normalized_sort))

    total = len(combined)
    total_pages = max(1, (total + normalized_page_size - 1) // normalized_page_size)
    safe_page = min(normalized_page, total_pages)
    start = (safe_page - 1) * normalized_page_size
    end = start + normalized_page_size
    page_items = combined[start:end]

    return _cache_set(cache_key, {
        "items": page_items,
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
    for product in result["items"]:
        normalized_product = _search_ready_product(
            product,
            fallback={"id": product.get("firestore_id", "")},
            enrich_image=False,
        )
        if not normalized_product:
            continue
        available_items.append(normalized_product)

    available_items = _dedupe_products(available_items, require_image=False)

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
    for product in result["items"]:
        normalized_product = _search_ready_product(
            product,
            fallback={"id": product.get("firestore_id", "")},
            enrich_image=False,
        )
        if not normalized_product:
            continue
        available_items.append(normalized_product)
    return _dedupe_products(available_items, require_image=False)


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

        product = get_firestore_product_by_id(product_id) if product_id else None
        stored_offers = []
        if product_id:
            merchant_offers = ((product or {}).get("raw") or {}).get("merchantOffers") or []
            for index, offer in enumerate(merchant_offers):
                stored_offers.append({
                    "id": offer.get("id") or f"stored-offer-{index}",
                    "retailer": offer.get("retailer") or "",
                    "title": offer.get("title") or f"{brand} {name}".strip(),
                    "price": offer.get("price"),
                    "url": offer.get("url") or "",
                    "image": offer.get("image") or "",
                    "shipping": offer.get("shipping") or "",
                    "source": offer.get("source") or "catalog",
                    "matchConfidence": offer.get("matchConfidence") or 100,
                })
        catalog_offers = _catalog_price_matches(brand, name, limit=12)
        live_offers = find_price_matches(brand, name, product_url=body.get("productUrl", ""), limit=12)
        merged = _merge_price_offers(
            catalog_offers,
            stored_offers,
            live_offers,
            brand=brand,
            name=name,
            limit=3,
        )
        if not merged:
            fallback_offer = _catalog_url_fallback_offer(
                product,
                brand=brand,
                name=name,
                fallback_url=body.get("productUrl", ""),
            )
            if fallback_offer:
                merged = [fallback_offer]
        return _cache_set(cache_key, merged)
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
    return _cache_set(cache_key, _ensure_product_image(normalized_product))


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
        original = _ensure_product_image(original)

        if not original:
            raise HTTPException(status_code=404, detail="Product not found")

        fallback_results = _fallback_dupe_candidates(
            original,
            brand=brand,
            name=name,
            product_type=product_type,
            category=category,
            limit=24,
        )
        results = _merge_ranked_candidates(model_results, fallback_results)

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
            dupe = _ensure_product_image(dupe)
            if not dupe:
                continue
            if _is_same_product_family_variant(original_firestore or original, firestore_record or dupe_source):
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
                "qualityScore": _dupe_quality_score(dupe),
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
                -(item.get("qualityScore") or 0),
                item["savings"] <= 0,
                -item["savings"],
                not bool(item["dupe"].get("image")),
                item["dupe"]["price"] <= 0,
                item["dupe"]["price"],
            )
        )
        return _cache_set(cache_key, deduped_output[:8])

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
