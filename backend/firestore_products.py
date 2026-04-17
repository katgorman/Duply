import os
from pathlib import Path
import time
import json
import hashlib
from typing import Iterable

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except Exception:
    firebase_admin = None
    credentials = None
    firestore = None

BASE_DIR = Path(__file__).resolve().parent


def normalize_text(value):
    if value is None:
        return ""
    return str(value).strip().lower()


def _safe_float(value):
    try:
        if value is None or value == "":
            return 0.0
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def _init_firestore():
    if firebase_admin is None or credentials is None or firestore is None:
        return None

    if not firebase_admin._apps:
        service_account_info = _service_account_from_env()

        if service_account_info:
            try:
                firebase_admin.initialize_app(credentials.Certificate(service_account_info))
            except Exception:
                return None
        else:
            cred_path = (
                os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
                or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            )

            if not cred_path:
                for filename in [
                    "firebase-service-account.json",
                    "firebase-credentials.json",
                ]:
                    candidate = BASE_DIR / filename
                    if candidate.exists():
                        cred_path = str(candidate)
                        break

            if cred_path:
                try:
                    firebase_admin.initialize_app(credentials.Certificate(cred_path))
                except Exception:
                    return None
            else:
                return None

    try:
        return firestore.client()
    except Exception:
        return None


def _service_account_from_env():
    raw_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if raw_json:
        try:
            return json.loads(raw_json)
        except Exception:
            return None

    project_id = os.getenv("FIREBASE_PROJECT_ID")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
    private_key = os.getenv("FIREBASE_PRIVATE_KEY")

    if not project_id or not client_email or not private_key:
        return None

    return {
        "type": "service_account",
        "project_id": project_id,
        "client_email": client_email,
        "private_key": private_key.replace("\\n", "\n"),
        "token_uri": "https://oauth2.googleapis.com/token",
    }


db = _init_firestore()
PRODUCTS_COLLECTION = os.getenv("FIRESTORE_PRODUCTS_COLLECTION", "beauty_products")
CACHE_TTL_SECONDS = int(os.getenv("FIRESTORE_CACHE_TTL_SECONDS", "900"))
SEARCH_CACHE_TTL_SECONDS = int(os.getenv("FIRESTORE_SEARCH_CACHE_TTL_SECONDS", "300"))
_search_cache = {}
METADATA_PATH = BASE_DIR / "cosmetics_metadata.json"
_metadata_products = None
_metadata_products_by_id = None
_catalog_products = None
_catalog_products_by_id = None
_catalog_cache_loaded_at = 0.0


PRODUCT_TYPE_ALIASES = {
    "foundation": "foundation",
    "powder foundation": "foundation",
    "concealer": "concealer",
    "blush": "blush",
    "bronzer": "bronzer",
    "powder": "powder",
    "primer": "primer",
    "highlighter": "highlighter",
    "lipstick": "lipstick",
    "lip gloss": "lipstick",
    "lip stain": "lipstick",
    "eyeshadow": "eyeshadow",
    "eye shadow": "eyeshadow",
    "eyeliner": "eyeliner",
    "eye liner": "eyeliner",
    "mascara": "mascara",
    "brow": "eyebrow",
    "eyebrow": "eyebrow",
    "nail polish": "nail_polish",
    "face mask": "face_mask",
    "cleanser": "cleanser",
    "moisturizer": "moisturizer",
    "serum": "serum",
    "sunscreen": "sunscreen",
}

CATEGORY_BUCKETS = {
    "eyes": {
        "eyeshadow",
        "eyeliner",
        "mascara",
        "eyebrow",
    },
    "lips": {
        "lipstick",
        "lip gloss",
        "lip_gloss",
        "lip stain",
    },
    "face": {
        "foundation",
        "concealer",
        "blush",
        "bronzer",
        "powder",
        "primer",
        "highlighter",
    },
    "skincare": {
        "cleanser",
        "moisturizer",
        "serum",
        "sunscreen",
        "face_mask",
        "face mask",
        "bodywash",
        "body wash",
    },
}


def normalize_product_type(value):
    normalized = normalize_text(value)
    return PRODUCT_TYPE_ALIASES.get(normalized, normalized)


def _slugify(value):
    normalized = normalize_text(value)
    normalized = normalized.replace("&", " and ")
    normalized = "".join(ch if ch.isalnum() else "-" for ch in normalized)
    normalized = "-".join(part for part in normalized.split("-") if part)
    return normalized or "item"


def build_catalog_product_id(product):
    brand = str(product.get("brand") or "").strip()
    name = str(product.get("product_name") or product.get("name") or "").strip()
    product_type = normalize_product_type(
        product.get("subcategory") or product.get("type") or product.get("productType") or product.get("category")
    )
    digest = hashlib.sha1(
        f"{normalize_text(brand)}|{normalize_text(name)}|{product_type}".encode("utf-8")
    ).hexdigest()[:12]
    return f"prod-{_slugify(brand)}-{_slugify(name)}-{digest}"


def invalidate_catalog_cache():
    global _catalog_products, _catalog_products_by_id, _catalog_cache_loaded_at
    _catalog_products = None
    _catalog_products_by_id = None
    _catalog_cache_loaded_at = 0.0
    _search_cache.clear()


def _product_bucket(product):
    product_type = normalize_product_type(product.get("subcategory") or product.get("type"))
    product_category = normalize_product_type(product.get("category"))
    candidates = {product_type, product_category}

    for bucket, values in CATEGORY_BUCKETS.items():
        normalized_values = {normalize_product_type(value) for value in values}
        if candidates & normalized_values:
            return bucket

    return "other"


def _candidate_values(record, keys):
    values = []
    for key in keys:
        value = record.get(key)
        if value is not None and value != "":
            values.append(str(value))
    return values


def _score_firestore_match(doc_data, target):
    target_brand = normalize_text(target.get("brand"))
    target_name = normalize_text(target.get("product_name"))
    target_category = normalize_text(target.get("category"))
    target_subcategory = normalize_product_type(target.get("subcategory") or target.get("type"))

    brand_values = _candidate_values(doc_data, ["Brand", "brand"])
    name_values = _candidate_values(doc_data, ["Product_Name", "product_name", "name", "title", "productName"])
    category_values = _candidate_values(doc_data, ["Category", "category", "main_category"])
    subcategory_values = _candidate_values(doc_data, ["subcategory", "productType", "type"])

    score = 0

    for value in brand_values:
        if normalize_text(value) == target_brand:
            score += 4
            break

    for value in name_values:
        normalized = normalize_text(value)
        if normalized == target_name:
            score += 8
            break
        if target_name and (target_name in normalized or normalized in target_name):
            score += 5
            break

    for value in category_values:
        if normalize_text(value) == target_category:
            score += 2
            break

    for value in subcategory_values:
        if normalize_product_type(value) == target_subcategory:
            score += 3
            break

    return score


def _normalize_firestore_product(doc):
    data = doc.to_dict() or {}
    category = data.get("Category") or data.get("category") or data.get("main_category") or ""
    product_type = normalize_product_type(
        data.get("subcategory") or data.get("productType") or data.get("type") or category
    )

    return {
        "firestore_id": doc.id,
        "brand": data.get("Brand") or data.get("brand") or "",
        "product_name": (
            data.get("Product_Name")
            or data.get("product_name")
            or data.get("name")
            or data.get("title")
            or data.get("productName")
            or ""
        ),
        "category": category,
        "subcategory": product_type,
        "type": product_type,
        "price": data.get("Price_USD") or data.get("price") or data.get("salePrice") or data.get("current_price") or 0,
        "rating": data.get("Rating") or data.get("rating") or data.get("avgRating") or 0,
        "image": data.get("image") or data.get("imageUrl") or data.get("image_link") or "",
        "raw": data,
    }


def _query_by_field(field, value, limit=10):
    if not value or db is None:
        return []

    try:
        docs = db.collection(PRODUCTS_COLLECTION).where(field, "==", value).limit(limit).stream()
        return list(docs)
    except Exception:
        return []


def _prefix_query(field, value, limit=15):
    if not value or db is None:
        return []

    try:
        docs = (
            db.collection(PRODUCTS_COLLECTION)
            .order_by(field)
            .start_at([value])
            .end_at([f"{value}\uf8ff"])
            .limit(limit)
            .stream()
        )
        return list(docs)
    except Exception:
        return []


def _brand_variants(query):
    raw = str(query or "").strip()
    if not raw:
        return []

    variants = [raw]
    title_variant = " ".join(part.capitalize() for part in raw.split())
    upper_variant = raw.upper()

    for value in [title_variant, upper_variant]:
        if value and value not in variants:
            variants.append(value)

    return variants


def _first_token_variants(query):
    normalized = normalize_text(query)
    first = normalized.split()[0] if normalized.split() else ""
    if not first:
        return []
    return _brand_variants(first)


def _dedupe_docs(docs: Iterable):
    seen_ids = set()
    unique = []

    for doc in docs:
        if not doc or doc.id in seen_ids:
            continue
        seen_ids.add(doc.id)
        unique.append(doc)

    return unique


def _product_search_score(product, normalized_query, query_tokens):
    brand = normalize_text(product.get("brand"))
    name = normalize_text(product.get("product_name"))
    category = normalize_text(product.get("category"))
    haystack = f"{brand} {name} {category}".strip()

    if not haystack:
        return -1

    score = 0

    if brand == normalized_query:
        score += 30
    elif brand.startswith(normalized_query):
        score += 24
    elif normalized_query in brand:
        score += 16

    if name == normalized_query:
        score += 28
    elif name.startswith(normalized_query):
        score += 22
    elif any(part.startswith(normalized_query) for part in name.split()):
        score += 18
    elif normalized_query in name:
        score += 12

    if category.startswith(normalized_query):
        score += 8
    elif normalized_query in category:
        score += 4

    token_matches = 0
    for token in query_tokens:
        if token in brand:
            score += 8
            token_matches += 1
        elif token in name:
            score += 7
            token_matches += 1
        elif token in category:
            score += 3
            token_matches += 1
        else:
            return -1

    if token_matches == len(query_tokens) and token_matches > 0:
        score += 10

    return score


def _search_cache_get(key):
    entry = _search_cache.get(key)
    if not entry:
        return None

    cached_at, value = entry
    if (time.time() - cached_at) > SEARCH_CACHE_TTL_SECONDS:
        _search_cache.pop(key, None)
        return None

    return value


def _search_cache_set(key, value):
    _search_cache[key] = (time.time(), value)


def _metadata_product_id(item):
    brand = normalize_text(item.get("brand"))
    name = normalize_text(item.get("product_name"))
    return f"meta-{brand}-{name}".replace(" ", "-")


def _load_metadata_products():
    global _metadata_products, _metadata_products_by_id

    if _metadata_products is not None:
        return _metadata_products

    if not METADATA_PATH.exists():
        _metadata_products = []
        _metadata_products_by_id = {}
        return _metadata_products

    try:
        raw_items = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    except Exception:
        _metadata_products = []
        _metadata_products_by_id = {}
        return _metadata_products

    normalized_items = []
    by_id = {}
    seen = set()

    for item in raw_items:
        brand = str(item.get("brand") or "")
        product_name = str(item.get("product_name") or "")
        if not brand and not product_name:
            continue

        key = (normalize_text(brand), normalize_text(product_name))
        if key in seen:
            continue
        seen.add(key)

        category = item.get("category") or ""
        product_type = normalize_product_type(
            item.get("subcategory") or item.get("type") or category
        )

        normalized = {
            "firestore_id": _metadata_product_id(item),
            "brand": brand,
            "product_name": product_name,
            "category": category,
            "subcategory": product_type,
            "type": product_type,
            "price": item.get("price") or 0,
            "rating": item.get("rating") or 0,
            "image": item.get("image") or item.get("image_link") or "",
            "raw": item,
        }
        normalized_items.append(normalized)
        by_id[normalized["firestore_id"]] = normalized

    _metadata_products = normalized_items
    _metadata_products_by_id = by_id
    return _metadata_products


def _get_metadata_product_by_id(product_id):
    _load_metadata_products()
    return (_metadata_products_by_id or {}).get(product_id)


def _metadata_match_score(product, target):
    brand = normalize_text(product.get("brand"))
    name = normalize_text(product.get("product_name"))
    category = normalize_text(product.get("category"))
    product_type = normalize_product_type(product.get("subcategory") or product.get("type"))

    target_brand = normalize_text(target.get("brand"))
    target_name = normalize_text(target.get("product_name"))
    target_category = normalize_text(target.get("category"))
    target_type = normalize_product_type(target.get("subcategory") or target.get("type"))

    score = 0

    if target_brand and brand == target_brand:
        score += 5
    elif target_brand and target_brand in brand:
        score += 3

    if target_name and name == target_name:
        score += 10
    elif target_name and (target_name in name or name in target_name):
        score += 6

    if target_category and category == target_category:
        score += 2

    if target_type and product_type == target_type:
        score += 4

    return score


def _fetch_metadata_product(target):
    products = _load_catalog_products()
    if not products:
        return None

    best_product = None
    best_score = -1

    for product in products:
        score = _metadata_match_score(product, target)
        if score > best_score:
            best_score = score
            best_product = product

    if not best_product or best_score <= 0:
        return None

    return best_product


def fetch_firestore_product(target):
    return _fetch_metadata_product(target)


def get_firestore_product_by_id(doc_id):
    if not doc_id:
        return None

    catalog_product = _catalog_products_by_id_map().get(doc_id)
    if catalog_product:
        return catalog_product

    try:
        if db is not None:
            doc = db.collection(PRODUCTS_COLLECTION).document(doc_id).get()
            if doc.exists:
                return _normalize_catalog_record(doc.to_dict() or {}, doc.id)
    except Exception:
        pass

    return _get_metadata_product_by_id(doc_id)


def search_firestore_products(query, limit=20):
    normalized_query = normalize_text(query)
    if not normalized_query:
        return []

    cache_key = (normalized_query, limit)
    cached = _search_cache_get(cache_key)
    if cached is not None:
        return cached

    query_tokens = [token for token in normalized_query.split() if token]
    products = _load_catalog_products()
    if not products:
        _search_cache_set(cache_key, [])
        return []

    scored = []
    for product in products:
        score = _product_search_score(product, normalized_query, query_tokens)
        if score < 0:
            continue
        scored.append((score, product))

    scored.sort(
        key=lambda item: (
            -item[0],
            normalize_text(item[1].get("brand")),
            normalize_text(item[1].get("product_name")),
        )
    )

    results = [product for _, product in scored[:limit]]
    _search_cache_set(cache_key, results)
    return results


def _category_matches(category_or_type):
    normalized_target = normalize_product_type(category_or_type)
    if not normalized_target:
        return []

    products = _load_catalog_products()
    matches = []

    for product in products:
        product_type = normalize_product_type(product.get("subcategory") or product.get("type"))
        product_category = normalize_product_type(product.get("category"))
        product_bucket = _product_bucket(product)
        if normalized_target in CATEGORY_BUCKETS or normalized_target == "other":
            if normalized_target != product_bucket:
                continue
        elif normalized_target not in {product_type, product_category}:
            continue
        matches.append(product)

    return matches


def _category_sort_key(product, sort_by):
    name = normalize_text(product.get("product_name"))
    brand = normalize_text(product.get("brand"))
    price = _safe_float(product.get("price"))
    rating = _safe_float(product.get("rating"))
    reviews = _safe_float(product.get("noofratings"))
    popularity = reviews + (rating * 100)

    if sort_by == "priceLow":
        return (price <= 0, price, name, brand)
    if sort_by == "priceHigh":
        return (price <= 0, -price, name, brand)
    if sort_by == "az":
        return (name, brand)
    return (-popularity, name, brand)


def count_products_by_category(category_or_type):
    return len(_category_matches(category_or_type))


def category_counts():
    return {category: count_products_by_category(category) for category in [*CATEGORY_BUCKETS.keys(), "other"]}


def list_products_by_category(category_or_type, limit=24, page=1, query="", sort_by="popular"):
    normalized_query = normalize_text(query)
    query_tokens = [token for token in normalized_query.split() if token]
    matches = _category_matches(category_or_type)

    if normalized_query:
        matches = [
            product for product in matches
            if _product_search_score(product, normalized_query, query_tokens) >= 0
        ]

    matches.sort(
        key=lambda product: _category_sort_key(product, sort_by)
    )

    total = len(matches)
    safe_limit = max(1, min(int(limit or 24), 100))
    safe_page = max(1, int(page or 1))
    start = (safe_page - 1) * safe_limit
    end = start + safe_limit

    return {
        "items": matches[start:end],
        "total": total,
        "page": safe_page,
        "pageSize": safe_limit,
        "totalPages": max(1, (total + safe_limit - 1) // safe_limit),
    }


def _normalize_catalog_record(data, doc_id=""):
    data = data or {}
    category = data.get("Category") or data.get("category") or data.get("main_category") or ""
    product_type = normalize_product_type(
        data.get("subcategory") or data.get("productType") or data.get("type") or category
    )

    return {
        "firestore_id": doc_id or data.get("id") or build_catalog_product_id(data),
        "brand": data.get("Brand") or data.get("brand") or "",
        "product_name": (
            data.get("Product_Name")
            or data.get("product_name")
            or data.get("name")
            or data.get("title")
            or data.get("productName")
            or ""
        ),
        "category": category,
        "subcategory": product_type,
        "type": product_type,
        "price": data.get("Price_USD") or data.get("price") or data.get("salePrice") or data.get("current_price") or 0,
        "rating": data.get("Rating") or data.get("rating") or data.get("avgRating") or 0,
        "image": data.get("image") or data.get("imageUrl") or data.get("image_link") or "",
        "raw": data,
    }


def _product_identity_key(product):
    return (
        normalize_text(product.get("brand")),
        normalize_text(product.get("product_name")),
        normalize_product_type(product.get("subcategory") or product.get("type") or product.get("category")),
    )


def _load_catalog_products(force_refresh=False):
    global _catalog_products, _catalog_products_by_id, _catalog_cache_loaded_at

    if (
        not force_refresh
        and _catalog_products is not None
        and (time.time() - _catalog_cache_loaded_at) <= CACHE_TTL_SECONDS
    ):
        return _catalog_products

    merged = []
    by_id = {}
    seen_identity = set()

    if db is not None:
        try:
            docs = list(db.collection(PRODUCTS_COLLECTION).stream())
        except Exception:
            docs = []

        for doc in docs:
            normalized = _normalize_catalog_record(doc.to_dict() or {}, doc.id)
            if not normalized.get("brand") or not normalized.get("product_name"):
                continue
            identity = _product_identity_key(normalized)
            if identity in seen_identity:
                continue
            seen_identity.add(identity)
            merged.append(normalized)
            by_id[normalized["firestore_id"]] = normalized

    for product in _load_metadata_products():
        identity = _product_identity_key(product)
        if identity in seen_identity:
            continue
        seen_identity.add(identity)
        merged.append(product)
        by_id[product["firestore_id"]] = product

    _catalog_products = merged
    _catalog_products_by_id = by_id
    _catalog_cache_loaded_at = time.time()
    return _catalog_products


def _catalog_products_by_id_map():
    _load_catalog_products()
    return _catalog_products_by_id or {}


def _normalize_upsert_product(product):
    source = product.get("source") or product.get("sourceProvider") or "catalog"
    brand = str(product.get("brand") or "").strip()
    name = str(product.get("product_name") or product.get("name") or "").strip()
    category = str(product.get("category") or "").strip()
    product_type = normalize_product_type(
        product.get("subcategory") or product.get("type") or product.get("productType") or category
    )
    price = _safe_float(product.get("price"))
    rating = _safe_float(product.get("rating"))
    image = str(product.get("image") or product.get("image_link") or product.get("imageUrl") or "").strip()
    product_url = (
        product.get("productUrl")
        or product.get("title-href")
        or product.get("raw", {}).get("productUrl")
        or ""
    )
    merchant_offers = product.get("merchantOffers") or product.get("raw", {}).get("merchantOffers") or []
    merchant_domain = str(product.get("merchantDomain") or product.get("raw", {}).get("merchantDomain") or "").strip()
    if not merchant_domain and product_url:
        merchant_domain = normalize_text(product_url.split("/")[2] if "://" in product_url else "")

    payload = {
        "id": product.get("firestore_id") or product.get("id") or build_catalog_product_id(product),
        "Brand": brand,
        "brand": brand,
        "Product_Name": name,
        "product_name": name,
        "name": name,
        "title": name,
        "Category": category,
        "category": category,
        "subcategory": product_type,
        "productType": product_type,
        "type": product_type,
        "Price_USD": price,
        "price": price,
        "salePrice": price,
        "current_price": price,
        "Rating": rating,
        "rating": rating,
        "avgRating": rating,
        "image": image,
        "imageUrl": image,
        "image_link": image,
        "productUrl": product_url,
        "merchantDomain": merchant_domain,
        "merchantOffers": merchant_offers,
        "sourceProvider": source,
        "source": source,
        "searchText": " ".join(part for part in [brand, name, category, product_type] if part).strip(),
        "availabilityStatus": product.get("availabilityStatus") or "active",
        "lastSeenAt": product.get("lastSeenAt") or int(time.time()),
        "lastValidatedAt": product.get("lastValidatedAt") or int(time.time()),
        "releaseYear": product.get("releaseYear") or product.get("raw", {}).get("releaseYear"),
        "raw": product.get("raw") or {},
    }
    return payload


def upsert_firestore_products(products):
    if db is None:
        return {"written": 0, "skipped": len(products or []), "available": False}

    normalized_products = []
    for product in products or []:
        payload = _normalize_upsert_product(product)
        if not payload.get("brand") or not payload.get("product_name"):
            continue
        normalized_products.append(payload)

    if not normalized_products:
        return {"written": 0, "skipped": 0, "available": True}

    batch = db.batch()
    written = 0
    for index, payload in enumerate(normalized_products, start=1):
        doc_id = payload["id"]
        doc_ref = db.collection(PRODUCTS_COLLECTION).document(doc_id)
        batch.set(doc_ref, payload, merge=True)
        if index % 400 == 0:
            batch.commit()
            batch = db.batch()
        written += 1

    batch.commit()
    invalidate_catalog_cache()
    return {"written": written, "skipped": 0, "available": True}


def get_firestore_status():
    service_account_info = _service_account_from_env()
    credentials_present = bool(
        service_account_info
        or os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    )

    status = {
        "available": db is not None,
        "credentialsPresent": credentials_present,
        "collection": PRODUCTS_COLLECTION,
        "catalogCount": None,
        "augmentedCount": None,
        "lastAugmentedAt": None,
    }

    if db is None:
        return status

    try:
        docs = list(db.collection(PRODUCTS_COLLECTION).stream())
        status["catalogCount"] = len(docs)

        augmented_docs = []
        for doc in docs:
            data = doc.to_dict() or {}
            if normalize_text(data.get("sourceProvider") or data.get("source")) == "dataforseo":
                augmented_docs.append(data)

        status["augmentedCount"] = len(augmented_docs)

        timestamps = [
            int(data.get("lastSeenAt") or 0)
            for data in augmented_docs
            if data.get("lastSeenAt") is not None
        ]
        if timestamps:
            status["lastAugmentedAt"] = max(timestamps)
    except Exception:
        pass

    return status
