import os
from pathlib import Path
import time
import json
import hashlib
import re
import unicodedata
from threading import Lock, Thread
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


_BAD_IMAGE_FRAGMENTS = {"logo", "placeholder", "default", "missing", "noimage", "blank", "fallback"}

def _is_valid_product_image(url):
    """Return False for relative paths, logo images, and other non-product images."""
    url = str(url or "").strip()
    if not url or not url.startswith(("http://", "https://")):
        return False
    lower = url.lower()
    return not any(frag in lower for frag in _BAD_IMAGE_FRAGMENTS)


def _clean_image(url):
    return url if _is_valid_product_image(url) else ""


def _safe_int(value, default=0):
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def canonicalize_catalog_text(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(part for part in text.split() if part)


def normalize_catalog_price(value):
    raw_value = str(value).strip() if value is not None else ""
    price = _safe_float(value)
    if price <= 0:
        return 0.0
    if raw_value and raw_value.count(".") > 1:
        return 0.0
    if price >= 1000:
        normalized = price / 100.0
        if 0 < normalized < price:
            price = normalized
    return round(price, 2)


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
WEB_CACHE_COLLECTION = os.getenv("FIRESTORE_WEB_CACHE_COLLECTION", "web_query_cache")
ADMIN_JOB_CACHE_KIND = "admin-job-state"
CACHE_TTL_SECONDS = int(os.getenv("FIRESTORE_CACHE_TTL_SECONDS", "21600"))
SEARCH_CACHE_TTL_SECONDS = int(os.getenv("FIRESTORE_SEARCH_CACHE_TTL_SECONDS", "300"))
WEB_CACHE_TTL_SECONDS = int(os.getenv("FIRESTORE_WEB_CACHE_TTL_SECONDS", "604800"))
FIRESTORE_READ_TIMEOUT_SECONDS = max(1.0, float(os.getenv("FIRESTORE_READ_TIMEOUT_SECONDS", "2.5")))
FIRESTORE_CATALOG_TIMEOUT_SECONDS = max(5.0, float(os.getenv("FIRESTORE_CATALOG_TIMEOUT_SECONDS", "30.0")))
_search_cache = {}
METADATA_PATH = BASE_DIR / "cosmetics_metadata.json"
NON_US_COUNTRY_TLDS = {
    ".ae", ".au", ".be", ".br", ".ca", ".ch", ".cn", ".de", ".dk", ".es",
    ".eu", ".fr", ".hk", ".ie", ".in", ".it", ".jp", ".kr", ".mx", ".nl",
    ".no", ".nz", ".pl", ".se", ".sg", ".tr", ".tw", ".uk", ".vn", ".za",
}
GENERIC_RETAILER_TLDS = {
    ".com", ".us", ".net", ".org", ".shop", ".store", ".beauty", ".makeup", ".cosmetics", ".co",
}
_metadata_products = None
_metadata_products_by_id = None
_catalog_products = None
_catalog_products_by_id = None
_catalog_products_by_category = None
_catalog_search_prefix_index = None
_catalog_cache_loaded_at = 0.0
_category_counts_cache = None
_catalog_status = "uninitialized"
_catalog_error = ""
_catalog_load_lock = Lock()
_catalog_warmup_started = False


PRODUCT_TYPE_ALIASES = {
    # Foundation / base
    "foundation": "foundation",
    "powder foundation": "foundation",
    "liquid foundation": "foundation",
    "skin tint": "skin_tint",
    "tinted moisturizer": "skin_tint",
    "skin tint serum": "skin_tint",
    "bb cream": "skin_tint",
    "cc cream": "skin_tint",
    # Concealer
    "concealer": "concealer",
    "liquid concealer": "concealer",
    "concealer stick": "concealer",
    # Blush / contour / bronzer
    "blush": "blush",
    "bronzer": "bronzer",
    "contour": "contour",
    "contour stick": "contour",
    "contour wand": "contour",
    "cream contour": "contour",
    # Powder / primer
    "powder": "powder",
    "setting powder": "powder",
    "pressed powder": "powder",
    "primer": "primer",
    "face primer": "primer",
    "gripping primer": "primer",
    # Highlighter / setting spray
    "highlighter": "highlighter",
    "setting spray": "setting_spray",
    "fixing spray": "setting_spray",
    "makeup setting spray": "setting_spray",
    # Lip products
    "lipstick": "lipstick",
    "matte lipstick": "lipstick",
    "satin lipstick": "lipstick",
    "lip stain": "lipstick",
    "lipstain": "lipstick",
    "lip color": "lipstick",
    "lip colour": "lipstick",
    "lip gloss": "lip_gloss",
    "lip_gloss": "lip_gloss",
    "lipgloss": "lip_gloss",
    "plumping lip gloss": "lip_gloss",
    "lip oil": "lip_oil",
    "lipoil": "lip_oil",
    "tinted lip oil": "lip_oil",
    "lip liner": "lip_liner",
    "lipliner": "lip_liner",
    "lip pencil": "lip_liner",
    "lip balm": "lip_balm",
    "lipbalm": "lip_balm",
    "tinted lip balm": "lip_balm",
    "lip mask": "lip_balm",
    # Eye products
    "eyeshadow": "eyeshadow",
    "eye shadow": "eyeshadow",
    "eyeshadow palette": "eyeshadow",
    "cream eyeshadow": "eyeshadow",
    "eye palette": "eyeshadow",
    "eyeliner": "eyeliner",
    "eye liner": "eyeliner",
    "liquid eyeliner": "eyeliner",
    "gel eyeliner": "eyeliner",
    "mascara": "mascara",
    "volumizing mascara": "mascara",
    "lengthening mascara": "mascara",
    "eyebrow": "eyebrow",
    "brow": "eyebrow",
    "brow makeup": "eyebrow",
    "brow kit": "eyebrow",
    "eyelashes": "eyebrow",
    "false lashes": "eyebrow",
    "lashes": "eyebrow",
    "brow gel": "brow_gel",
    "eyebrow gel": "brow_gel",
    "brow pencil": "brow_pencil",
    "eyebrow pencil": "brow_pencil",
    # Nails
    "nail": "nail_polish",
    "nails": "nail_polish",
    "nail polish": "nail_polish",
    "nail color": "nail_polish",
    "nail colour": "nail_polish",
    "nail lacquer": "nail_polish",
    "nail varnish": "nail_polish",
    "nail enamel": "nail_polish",
    "nail gel": "nail_polish",
    "gel nail": "nail_polish",
    "gel polish": "nail_polish",
    "nail treatment": "nail_polish",
    "nail topcoat": "nail_polish",
    "nail top coat": "nail_polish",
    "nail base coat": "nail_polish",
    "nail care": "nail_polish",
    "nail art": "nail_polish",
    "nail set": "nail_polish",
    # Skincare — masks
    "face mask": "face_mask",
    "face_mask": "face_mask",
    "mask": "face_mask",
    "sheet mask": "face_mask",
    "sleeping mask": "face_mask",
    "overnight mask": "face_mask",
    "sleep mask": "face_mask",
    "peel off mask": "face_mask",
    "face peel": "face_mask",
    "peel": "face_mask",
    "eye mask": "eye_mask",
    "eye patches": "eye_mask",
    "undereye patches": "eye_mask",
    "under eye patches": "eye_mask",
    # Skincare — cleansers
    "cleanser": "cleanser",
    "face cleanser": "cleanser",
    "face wash": "cleanser",
    "facewash": "cleanser",
    "facial cleanser": "cleanser",
    "foam cleanser": "cleanser",
    "gel cleanser": "cleanser",
    "micellar water": "cleanser",
    "cleansing oil": "cleanser",
    "cleansing balm": "cleanser",
    "makeup remover": "cleanser",
    "cleansing milk": "cleanser",
    "cleansing water": "cleanser",
    "soap": "cleanser",
    "bar soap": "cleanser",
    "facial soap": "cleanser",
    # Skincare — moisturizers
    "moisturizer": "moisturizer",
    "face moisturizer": "moisturizer",
    "cream moisturizer": "moisturizer",
    "face cream": "moisturizer",
    "facial cream": "moisturizer",
    "hydrating cream": "moisturizer",
    "day cream": "moisturizer",
    "night cream": "moisturizer",
    "eye cream": "eye_cream",
    "eye gel": "eye_cream",
    "eye serum": "eye_cream",
    "under eye cream": "eye_cream",
    "eye treatment": "eye_cream",
    "eyetreatment": "eye_cream",
    "eye contour": "eye_cream",
    # Skincare — serums & treatments
    "serum": "serum",
    "face serum": "serum",
    "facial serum": "serum",
    "vitamin c serum": "serum",
    "retinol serum": "serum",
    "retinol": "serum",
    "vitamin c": "serum",
    "face oil": "face_oil",
    "facial oil": "face_oil",
    "dry oil": "face_oil",
    "oil": "face_oil",
    "face mist": "face_mist",
    "facial mist": "face_mist",
    "hydrating mist": "face_mist",
    "face spray": "face_mist",
    "setting mist": "face_mist",
    "toner": "toner",
    "face toner": "toner",
    "toning lotion": "toner",
    "toning water": "toner",
    "essence": "toner",
    "face essence": "toner",
    "skin essence": "toner",
    "exfoliator": "exfoliator",
    "face scrub": "exfoliator",
    "exfoliating scrub": "exfoliator",
    "chemical exfoliator": "exfoliator",
    "aha": "exfoliator",
    "bha": "exfoliator",
    "spot treatment": "serum",
    "acne treatment": "serum",
    "blemish treatment": "serum",
    # Skincare — sunscreen
    "sunscreen": "sunscreen",
    "face sunscreen": "sunscreen",
    "spf": "sunscreen",
    "tinted sunscreen": "sunscreen",
    "spf moisturizer": "sunscreen",
    "sun protection": "sunscreen",
    # Body
    "bodywash": "bodywash",
    "body wash": "bodywash",
    "body lotion": "body_lotion",
    "body cream": "body_lotion",
    "body milk": "body_lotion",
    "body butter": "body_lotion",
    "body oil": "body_lotion",
    "hand cream": "body_lotion",
    "hand lotion": "body_lotion",
    "body moisturizer": "body_lotion",
    # Lip extras
    "lip plumper": "lip_gloss",
    "lip plumping gloss": "lip_gloss",
    "lip scrub": "lip_balm",
    "lip exfoliator": "lip_balm",
    "lip treatment": "lip_balm",
    "lip serum": "lip_oil",
    # Eye extras
    "eye primer": "eyeshadow",
    "eyeshadow primer": "eyeshadow",
    "eye base": "eyeshadow",
    "brow pomade": "brow_gel",
    "brow wax": "brow_gel",
    "brow tint": "brow_gel",
    "brow fiber": "eyebrow",
    "brow serum": "eyebrow",
    "lash serum": "serum",
    # Face extras
    "color corrector": "concealer",
    "colour corrector": "concealer",
    "color correcting": "concealer",
    "illuminator": "highlighter",
    "glow": "highlighter",
    "cushion foundation": "foundation",
    "serum foundation": "foundation",
    "skin tint stick": "skin_tint",
    "face glitter": "highlighter",
}

CATEGORY_BUCKETS = {
    "eyes": {
        "eyeshadow",
        "eyeliner",
        "mascara",
        "eyebrow",
        "brow_gel",
        "brow_pencil",
    },
    "lips": {
        "lipstick",
        "lip_gloss",
        "lip_oil",
        "lip_liner",
        "lip_balm",
    },
    "face": {
        "foundation",
        "concealer",
        "blush",
        "bronzer",
        "powder",
        "primer",
        "highlighter",
        "contour",
        "setting_spray",
        "skin_tint",
    },
    "skincare": {
        "cleanser",
        "moisturizer",
        "serum",
        "sunscreen",
        "face_mask",
        "eye_mask",
        "eye_cream",
        "face_oil",
        "face_mist",
        "toner",
        "exfoliator",
        "bodywash",
        "body_lotion",
    },
    "nails": {
        "nail_polish",
    },
}

VARIANT_STOP_WORDS = {
    "shade",
    "shades",
    "color",
    "colors",
    "colour",
    "colours",
    "hue",
    "tone",
    "tones",
    "finish",
    "variant",
}


def normalize_product_type(value):
    normalized = normalize_text(value)
    return PRODUCT_TYPE_ALIASES.get(normalized, normalized)


_NORMALIZED_CATEGORY_BUCKETS = {
    bucket: {normalize_product_type(v) for v in values}
    for bucket, values in CATEGORY_BUCKETS.items()
}
_CATEGORY_BUCKET_KEYWORDS = {
    bucket: [kw for kw in (normalize_product_type(v).replace("_", " ") for v in values) if kw]
    for bucket, values in CATEGORY_BUCKETS.items()
}


def _record_id(product):
    return str(product.get("id") or product.get("firestore_id") or "").strip()


def _record_brand(product):
    return str(product.get("brand") or product.get("Brand") or "").strip()


def _record_name(product):
    return str(product.get("product_name") or product.get("name") or product.get("Product_Name") or "").strip()


def _record_category(product):
    return str(product.get("category") or product.get("Category") or product.get("main_category") or "").strip()


def _record_product_type(product):
    return normalize_product_type(
        product.get("productType")
        or product.get("subcategory")
        or product.get("type")
        or _record_category(product)
    )


def _record_image(product):
    raw = product.get("raw", {}) if isinstance(product.get("raw"), dict) else {}
    merchant_offers = product.get("merchantOffers") or raw.get("merchantOffers") or []
    offer_image = ""
    for offer in merchant_offers:
        if isinstance(offer, dict) and offer.get("image"):
            offer_image = str(offer.get("image") or "").strip()
            if offer_image:
                break

    return str(
        product.get("image")
        or product.get("imageUrl")
        or product.get("image_link")
        or raw.get("image")
        or raw.get("imageUrl")
        or offer_image
        or ""
    ).strip()


def _record_price(product):
    return normalize_catalog_price(
        product.get("price")
        or product.get("Price_USD")
        or product.get("salePrice")
        or product.get("current_price")
        or 0
    )


def _normalize_family_token(value):
    return re.sub(r"[^a-z0-9]+", " ", normalize_text(value)).strip()


def _to_title_case(value):
    return " ".join(
        part[:1].upper() + part[1:]
        for part in re.split(r"\s+", str(value or "").strip())
        if part
    )


def _looks_like_variant_suffix(value):
    normalized = _normalize_family_token(value)
    if not normalized:
        return False

    if re.match(r"^[a-z]?\d{2,6}(?:\s+[a-z0-9].*)?$", str(value or "").strip(), re.IGNORECASE):
        return True

    token_count = len(normalized.split())
    return token_count <= 4 and len(normalized) <= 28


def _normalize_variant_label(value):
    return re.sub(r"^[|:,\-()\s]+|[|:,\-()\s]+$", "", str(value or "").strip())


def _split_title_stem(name):
    trimmed = str(name or "").strip()
    separated = re.match(r"^(.*?)(?:\s+(?:\||:|-)\s+)([^|:]{1,40})$", trimmed)
    if separated and separated.group(1) and separated.group(2):
        stem = separated.group(1).strip()
        suffix = _normalize_variant_label(separated.group(2))
        if stem and _looks_like_variant_suffix(suffix) and len(stem) >= max(6, int(len(trimmed) * 0.45)):
            return stem, suffix

    patterns = [
        r"^(.*)\s+[|:-]\s*([a-z]?\d{2,6}\b[^|:-]{0,40})\s*$",
        r"^(.*)\s+[(-]([^()]*?(?:shade|color|colour|tone|hue|finish|variant)[^()]*)[)\-]\s*$",
        r"^(.*)\s+\b(?:in\s+)?(?:shade|color|colour|tone|hue|finish)\b\s+(.+)$",
        r"^(.*)\s+\b(?:mini|travel size|full size)\b\s*$",
    ]

    for pattern in patterns:
        matched = re.match(pattern, trimmed, re.IGNORECASE)
        stem = (matched.group(1).strip() if matched and matched.group(1) else "")
        suffix = _normalize_variant_label(matched.group(2) if matched and matched.lastindex and matched.lastindex >= 2 else "")
        if stem and len(stem) >= max(6, int(len(trimmed) * 0.45)):
            if not suffix or _looks_like_variant_suffix(suffix):
                return stem, suffix

    return trimmed, ""


def build_product_family_name(product):
    stem, _ = _split_title_stem(_record_name(product))
    return stem or _record_name(product)


def build_product_family_key(product):
    brand = _normalize_family_token(_record_brand(product))
    product_type = _normalize_family_token(_record_product_type(product))
    family_name = _normalize_family_token(build_product_family_name(product))
    return "|".join([brand, product_type, family_name])


def extract_product_variant_label(product, family_name=None):
    resolved_family_name = family_name or build_product_family_name(product)
    name = _record_name(product)
    if name and resolved_family_name and normalize_text(name) != normalize_text(resolved_family_name):
        stem, variant_label = _split_title_stem(name)
        normalized_variant = _normalize_family_token(variant_label)
        if (
            normalize_text(stem) == normalize_text(str(resolved_family_name).strip())
            and variant_label
            and len(variant_label) <= 40
            and normalized_variant
            and normalized_variant not in VARIANT_STOP_WORDS
        ):
            return _to_title_case(variant_label)
    return ""


def _build_family_variant_options(siblings, family_name):
    variant_options = []
    seen_ids = set()

    for sibling in siblings:
        option_id = _record_id(sibling)
        if not option_id or option_id in seen_ids:
            continue
        seen_ids.add(option_id)

        label = extract_product_variant_label(sibling, family_name)
        image = _record_image(sibling)
        if not label and not image:
            continue

        variant_options.append({
            "id": option_id,
            "label": label,
            "image": image,
            "price": _record_price(sibling),
        })

    variant_options.sort(key=lambda item: ((item.get("label") or "").lower(), item.get("id") or ""))
    return variant_options if len(variant_options) > 1 else []


def _preferred_family_product(siblings, family_name):
    preferred = next(
        (product for product in siblings if not extract_product_variant_label(product, family_name)),
        None,
    )
    if preferred:
        return preferred

    return sorted(
        siblings,
        key=lambda product: (
            not bool(_record_image(product)),
            normalize_text(_record_name(product)),
            _record_id(product),
        ),
    )[0]


def _family_searchable_tokens(siblings):
    tokens = set()
    for sibling in siblings:
        tokens.update(_searchable_tokens(sibling))
    return tokens


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


def build_catalog_dedupe_key(product):
    return (
        canonicalize_catalog_text(product.get("brand")),
        canonicalize_catalog_text(product.get("product_name") or product.get("name")),
        normalize_product_type(
            product.get("subcategory") or product.get("type") or product.get("productType") or product.get("category")
        ),
    )


def build_web_cache_id(cache_kind, cache_key):
    digest = hashlib.sha1(
        f"{normalize_text(cache_kind)}|{normalize_text(cache_key)}".encode("utf-8")
    ).hexdigest()
    return f"cache-{digest}"


def invalidate_catalog_cache():
    global _catalog_products, _catalog_products_by_id, _catalog_products_by_category, _catalog_search_prefix_index, _catalog_cache_loaded_at, _category_counts_cache, _catalog_status, _catalog_error, _catalog_warmup_started
    _catalog_products = None
    _catalog_products_by_id = None
    _catalog_products_by_category = None
    _catalog_search_prefix_index = None
    _catalog_cache_loaded_at = 0.0
    _category_counts_cache = None
    _catalog_status = "uninitialized"
    _catalog_error = ""
    _catalog_warmup_started = False
    _search_cache.clear()


def get_firestore_web_cache(cache_kind, cache_key, max_age_seconds=WEB_CACHE_TTL_SECONDS):
    if db is None or not cache_kind or not cache_key:
        return None

    doc = _run_firestore_read(
        lambda timeout: (
            db.collection(WEB_CACHE_COLLECTION)
            .document(build_web_cache_id(cache_kind, cache_key))
            .get(timeout=timeout)
        ),
        None,
    )
    if doc is None:
        return None

    if not doc.exists:
        return None

    data = doc.to_dict() or {}
    cached_at = _safe_int(data.get("cachedAt"))
    if cached_at <= 0:
        return None

    if max_age_seconds and (time.time() - cached_at) > max_age_seconds:
        return None

    return data.get("payload")


def set_firestore_web_cache(cache_kind, cache_key, payload):
    if db is None or not cache_kind or not cache_key:
        return False

    now = int(time.time())
    record = {
        "cacheKind": normalize_text(cache_kind),
        "cacheKey": str(cache_key),
        "payload": payload,
        "cachedAt": now,
        "updatedAt": now,
    }

    try:
        (
            db.collection(WEB_CACHE_COLLECTION)
            .document(build_web_cache_id(cache_kind, cache_key))
            .set(record, merge=True)
        )
        return True
    except Exception:
        return False


def get_admin_job_state(job_id):
    return get_firestore_web_cache(ADMIN_JOB_CACHE_KIND, str(job_id or "").strip(), 0)


def set_admin_job_state(job_id, payload):
    return set_firestore_web_cache(ADMIN_JOB_CACHE_KIND, str(job_id or "").strip(), payload)


def _product_bucket(product):
    raw_fields = [
        product.get("subcategory"),
        product.get("type"),
        product.get("category"),
        product.get("productType"),
        (product.get("raw") or {}).get("category"),
    ]
    candidates = {normalize_product_type(str(f)) for f in raw_fields if f}

    for bucket, normalized_values in _NORMALIZED_CATEGORY_BUCKETS.items():
        if candidates & normalized_values:
            return bucket

    combined = " ".join(normalize_product_type(str(f)) for f in raw_fields if f).replace("_", " ")
    for bucket, keywords in _CATEGORY_BUCKET_KEYWORDS.items():
        for keyword in keywords:
            if keyword in combined:
                return bucket

    return "other"


def _prepare_catalog_product(product):
    normalized = dict(product or {})
    brand = normalize_text(normalized.get("brand"))
    name = normalize_text(normalized.get("product_name"))
    category = normalize_text(normalized.get("category"))
    product_type = normalize_product_type(
        normalized.get("subcategory") or normalized.get("type") or normalized.get("category")
    )
    tokens = tuple(token for token in f"{brand} {name} {category} {product_type}".split() if token)

    normalized["_searchBrand"] = brand
    normalized["_searchName"] = name
    normalized["_searchCategory"] = category
    normalized["_searchType"] = product_type
    normalized["_searchTokens"] = tokens
    normalized["_bucket"] = _product_bucket(normalized)
    normalized["_popularity"] = _safe_float(normalized.get("noofratings")) + (_safe_float(normalized.get("rating")) * 100)
    return normalized


def _run_firestore_read(callable_obj, default, timeout=None):
    if db is None:
        return default

    effective_timeout = timeout if timeout is not None else FIRESTORE_READ_TIMEOUT_SECONDS
    try:
        return callable_obj(effective_timeout)
    except TypeError:
        try:
            return callable_obj()
        except Exception:
            return default
    except Exception:
        return default


def _catalog_product_url(product):
    raw = product.get("raw", {}) if isinstance(product.get("raw"), dict) else {}
    return str(
        product.get("productUrl")
        or product.get("title-href")
        or raw.get("productUrl")
        or raw.get("title-href")
        or ""
    ).strip()


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


def _is_searchable_catalog_product(product):
    product_url = _catalog_product_url(product)
    if not product_url:
        return True

    domain = _source_domain(product_url)
    return product_url.startswith(("http://", "https://")) and "." in domain and _is_us_domain(domain)


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

    raw = data.get("raw", {}) if isinstance(data.get("raw"), dict) else {}
    merchant_offers = data.get("merchantOffers") or raw.get("merchantOffers") or []
    offer_image = ""
    for offer in merchant_offers:
        if isinstance(offer, dict) and offer.get("image"):
            offer_image = str(offer.get("image") or "").strip()
            if offer_image:
                break

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
        "image": _clean_image(data.get("image") or data.get("imageUrl") or data.get("image_link") or raw.get("image") or raw.get("imageUrl") or offer_image or ""),
        "raw": data,
    }


def _query_by_field(field, value, limit=10):
    if not value or db is None:
        return []

    return _run_firestore_read(
        lambda timeout: list(db.collection(PRODUCTS_COLLECTION).where(field, "==", value).limit(limit).stream(timeout=timeout)),
        [],
    )


def _prefix_query(field, value, limit=15):
    if not value or db is None:
        return []

    return _run_firestore_read(
        lambda timeout: list(
            db.collection(PRODUCTS_COLLECTION)
            .order_by(field)
            .start_at([value])
            .end_at([f"{value}\uf8ff"])
            .limit(limit)
            .stream(timeout=timeout)
        ),
        [],
    )


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


ACCESSORY_SEARCH_TOKENS = {
    "accessory",
    "applicator",
    "bag",
    "blender",
    "bottle",
    "brush",
    "brushes",
    "case",
    "cleaner",
    "compact",
    "holder",
    "kit",
    "kits",
    "mirror",
    "sharpener",
    "sponge",
    "tool",
    "tools",
}


def _product_search_score(product, normalized_query, query_tokens):
    brand = product.get("_searchBrand") or normalize_text(product.get("brand"))
    name = product.get("_searchName") or normalize_text(product.get("product_name"))
    category = product.get("_searchCategory") or normalize_text(product.get("category"))
    aliases = " ".join(product.get("_searchAliases") or [])
    haystack = f"{brand} {name} {category} {aliases}".strip()

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
    elif aliases and normalized_query in aliases:
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
        elif aliases and token in aliases:
            score += 7
            token_matches += 1
        elif token in category:
            score += 3
            token_matches += 1
        else:
            return -1

    if token_matches == len(query_tokens) and token_matches > 0:
        score += 10

    query_token_set = set(query_tokens)
    name_tokens = set(re.findall(r"[a-z0-9]+", name))
    accessory_tokens = name_tokens & ACCESSORY_SEARCH_TOKENS
    if accessory_tokens and not (query_token_set & ACCESSORY_SEARCH_TOKENS):
        score -= 18 * len(accessory_tokens)

    return score


def _searchable_tokens(product):
    searchable = " ".join([
        str(product.get("_searchBrand") or product.get("brand") or ""),
        str(product.get("_searchName") or product.get("product_name") or ""),
        str(product.get("_searchCategory") or product.get("category") or ""),
        str(product.get("_searchType") or product.get("subcategory") or product.get("type") or ""),
    ])
    return {
        token
        for token in re.findall(r"[a-z0-9]+", searchable)
        if len(token) >= 2
    }


def _token_prefixes(token, min_length=2, max_length=10):
    safe_token = normalize_text(token)
    if len(safe_token) < min_length:
        return []
    return [
        safe_token[:length]
        for length in range(min_length, min(len(safe_token), max_length) + 1)
    ]


def _indexed_search_candidates(query_tokens):
    _load_catalog_products()

    if not query_tokens or _catalog_search_prefix_index is None:
        return None

    candidate_ids = None
    index_used = False

    for token in query_tokens:
        if len(token) < 2:
            continue

        prefix_matches = _catalog_search_prefix_index.get(token)
        if not prefix_matches:
            return []

        token_ids = set(prefix_matches)
        candidate_ids = token_ids if candidate_ids is None else (candidate_ids & token_ids)
        index_used = True

        if not candidate_ids:
            return []

    if not index_used or candidate_ids is None:
        return None

    products_by_id = _catalog_products_by_id or {}
    return [
        products_by_id[product_id]
        for product_id in candidate_ids
        if product_id in products_by_id
    ]


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

        key = build_catalog_dedupe_key({
            "brand": brand,
            "product_name": product_name,
            "type": item.get("subcategory") or item.get("type") or item.get("category") or "",
        })
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
            "price": normalize_catalog_price(item.get("price") or 0),
            "rating": item.get("rating") or 0,
            "image": item.get("image") or item.get("image_link") or "",
            "productUrl": item.get("productUrl") or item.get("title-href") or "",
            "raw": item,
        }
        if not _is_searchable_catalog_product(normalized):
            continue
        prepared = _prepare_catalog_product(normalized)
        normalized_items.append(prepared)
        by_id[prepared["firestore_id"]] = prepared

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
    _load_catalog_products()
    products = list((_catalog_products_by_id or {}).values())
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

    doc = _run_firestore_read(
        lambda timeout: db.collection(PRODUCTS_COLLECTION).document(doc_id).get(timeout=timeout),
        None,
    )
    if doc is not None and getattr(doc, "exists", False):
        return _normalize_catalog_record(doc.to_dict() or {}, doc.id)

    return _get_metadata_product_by_id(doc_id)


def search_firestore_products(query, limit=20):
    normalized_query = normalize_text(query)
    if not normalized_query:
        return []

    cache_key = ("search", normalized_query)
    cached = _search_cache_get(cache_key)
    if cached is not None:
        return cached[:limit]

    query_tokens = [token for token in normalized_query.split() if token]
    products = _indexed_search_candidates(query_tokens)
    if products is None:
        warm_catalog_cache()
        products = _catalog_products or []
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
            item[1].get("_searchBrand") or normalize_text(item[1].get("brand")),
            item[1].get("_searchName") or normalize_text(item[1].get("product_name")),
        )
    )

    results = [product for _, product in scored]
    _search_cache_set(cache_key, results)
    return results[:limit]


def _category_matches(category_or_type):
    normalized_target = normalize_product_type(category_or_type)
    if not normalized_target:
        return []

    warm_catalog_cache()
    return list((_catalog_products_by_category or {}).get(normalized_target, []))


def _category_sort_key(product, sort_by):
    name = product.get("_searchName") or normalize_text(product.get("product_name"))
    brand = product.get("_searchBrand") or normalize_text(product.get("brand"))
    price = normalize_catalog_price(product.get("price"))
    rating = _safe_float(product.get("rating"))
    popularity = product.get("_popularity")
    if popularity is None:
        popularity = _safe_float(product.get("noofratings")) + (rating * 100)

    if sort_by == "priceLow":
        return (price <= 0, price, name, brand)
    if sort_by == "priceHigh":
        return (price <= 0, -price, name, brand)
    if sort_by == "az":
        return (name, brand)
    return (-popularity, name, brand)


def count_products_by_category(category_or_type):
    return len(_category_matches(category_or_type))


def _rounded_category_estimate(count):
    safe_count = max(0, int(count or 0))
    if safe_count <= 0:
        return 0
    if safe_count < 100:
        step = 25
    elif safe_count < 500:
        step = 50
    elif safe_count < 2000:
        step = 100
    else:
        step = 250
    return max(step, (safe_count // step) * step)


def category_counts():
    global _category_counts_cache
    if _category_counts_cache is not None:
        return _category_counts_cache

    _load_catalog_products()
    by_cat = _catalog_products_by_category or {}
    counts = {bucket: len(by_cat.get(bucket, [])) for bucket in [*CATEGORY_BUCKETS.keys(), "other"]}

    _category_counts_cache = counts
    return _category_counts_cache


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
    raw = data.get("raw", {}) if isinstance(data.get("raw"), dict) else {}
    merchant_offers = data.get("merchantOffers") or raw.get("merchantOffers") or []
    offer_image = ""
    for offer in merchant_offers:
        if isinstance(offer, dict) and offer.get("image"):
            offer_image = str(offer.get("image") or "").strip()
            if offer_image:
                break

    return _prepare_catalog_product({
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
        "price": normalize_catalog_price(
            data.get("Price_USD") or data.get("price") or data.get("salePrice") or data.get("current_price") or 0
        ),
        "rating": data.get("Rating") or data.get("rating") or data.get("avgRating") or 0,
        "image": _clean_image(data.get("image") or data.get("imageUrl") or data.get("image_link") or raw.get("image") or raw.get("imageUrl") or offer_image or ""),
        "raw": data,
    })


def _product_identity_key(product):
    return build_catalog_dedupe_key(product)


def _stream_collection_paginated(collection_name, page_size=500, page_timeout=30.0):
    """Stream an entire Firestore collection in pages to avoid single-request timeouts."""
    all_docs = []
    last_doc = None

    while True:
        query = db.collection(collection_name).order_by("__name__").limit(page_size)
        if last_doc is not None:
            query = query.start_after(last_doc)

        page = _run_firestore_read(lambda timeout, q=query: list(q.stream(timeout=timeout)), None, timeout=page_timeout)
        if page is None:
            if all_docs:
                raise RuntimeError("Timed out streaming Firestore catalog before pagination completed")
            break
        if not page:
            break

        all_docs.extend(page)
        if len(page) < page_size:
            break
        last_doc = page[-1]

    return all_docs


def _store_catalog_products(merged):
    global _catalog_products, _catalog_products_by_id, _catalog_products_by_category, _catalog_search_prefix_index, _catalog_cache_loaded_at

    by_id = {}
    by_category = {}
    by_category_seen = {}
    search_prefix_index = {}
    family_groups = {}

    for product in merged:
        family_groups.setdefault(build_product_family_key(product), []).append(product)

    family_products = []
    for siblings in family_groups.values():
        family_name = build_product_family_name(siblings[0])
        variant_group_id = build_product_family_key(siblings[0])
        variant_options = _build_family_variant_options(siblings, family_name)
        enriched_siblings = []

        for sibling in siblings:
            enriched = {
                **sibling,
                "familyName": family_name,
                "variantGroupId": variant_group_id,
                "selectedVariantLabel": extract_product_variant_label(sibling, family_name),
                "variantOptions": list(variant_options),
            }
            enriched_siblings.append(enriched)
            sibling_id = enriched.get("firestore_id")
            if sibling_id:
                by_id[sibling_id] = enriched

        representative = _preferred_family_product(enriched_siblings, family_name)
        family_search_aliases = tuple(sorted({
            alias
            for sibling in enriched_siblings
            for alias in {
                sibling.get("_searchName") or normalize_text(_record_name(sibling)),
                canonicalize_catalog_text(_record_name(sibling)),
            }
            if alias
        }))
        representative = {
            **representative,
            "_searchAliases": family_search_aliases,
        }
        representative_id = representative.get("firestore_id")
        if representative_id:
            by_id[representative_id] = representative
        family_products.append(representative)

        bucket = representative.get("_bucket") or _product_bucket(representative)
        product_type = representative.get("_searchType") or normalize_product_type(representative.get("subcategory") or representative.get("type"))
        category = normalize_product_type(representative.get("category"))

        brand_token = _normalize_family_token(_record_brand(representative))
        family_token = _normalize_family_token(family_name)
        family_dedup_key = (brand_token, family_token)
        for key in {bucket, product_type, category}:
            if not key:
                continue
            if family_dedup_key in by_category_seen.get(key, set()):
                continue
            by_category_seen.setdefault(key, set()).add(family_dedup_key)
            by_category.setdefault(key, []).append(representative)

        if representative_id:
            for token in _family_searchable_tokens(enriched_siblings):
                for prefix in _token_prefixes(token):
                    search_prefix_index.setdefault(prefix, set()).add(representative_id)

    _catalog_products = family_products
    _catalog_products_by_id = by_id
    _catalog_products_by_category = by_category
    _catalog_search_prefix_index = search_prefix_index
    _catalog_cache_loaded_at = time.time()
    return _catalog_products


def _load_metadata_catalog():
    global _catalog_status, _catalog_error

    merged = []
    seen_identity = set()
    for product in _load_metadata_products():
        identity = _product_identity_key(product)
        if identity in seen_identity:
            continue
        seen_identity.add(identity)
        merged.append(product)

    if not merged:
        raise RuntimeError("No metadata catalog products available")

    result = _store_catalog_products(merged)
    _catalog_status = "ready"
    _catalog_error = ""
    return result


def _catalog_cache_is_fresh():
    return (
        _catalog_products is not None
        and (
            CACHE_TTL_SECONDS <= 0
            or (time.time() - _catalog_cache_loaded_at) <= CACHE_TTL_SECONDS
        )
    )


def _load_catalog_products(force_refresh=False):
    global _catalog_products, _catalog_products_by_id, _catalog_products_by_category, _catalog_search_prefix_index, _catalog_cache_loaded_at, _catalog_status, _catalog_error, _catalog_warmup_started

    if not force_refresh and _catalog_cache_is_fresh():
        return _catalog_products

    with _catalog_load_lock:
        if not force_refresh and _catalog_cache_is_fresh():
            return _catalog_products

        had_cached_catalog = _catalog_products is not None
        _catalog_status = "refreshing" if had_cached_catalog else "warming"
        _catalog_error = ""

        try:
            merged = []
            seen_identity = set()

            if db is not None:
                docs = _stream_collection_paginated(
                    PRODUCTS_COLLECTION,
                    page_size=500,
                    page_timeout=FIRESTORE_CATALOG_TIMEOUT_SECONDS,
                )

                for doc in docs:
                    normalized = _normalize_catalog_record(doc.to_dict() or {}, doc.id)
                    if not normalized.get("brand") or not normalized.get("product_name"):
                        continue
                    if not _is_searchable_catalog_product(normalized):
                        continue
                    identity = _product_identity_key(normalized)
                    if identity in seen_identity:
                        continue
                    seen_identity.add(identity)
                    merged.append(normalized)

            if not merged:
                return _load_metadata_catalog()

            _store_catalog_products(merged)
            _catalog_status = "ready"
            _catalog_error = ""
            return _catalog_products
        except Exception as exc:
            _catalog_error = str(exc)
            if had_cached_catalog and _catalog_products is not None:
                _catalog_status = "ready"
                return _catalog_products
            try:
                return _load_metadata_catalog()
            except Exception:
                pass
            _catalog_status = "failed"
            raise
        finally:
            _catalog_warmup_started = False


def _catalog_products_by_id_map():
    if _catalog_products is None:
        warm_catalog_cache()
    return _catalog_products_by_id or {}


def is_catalog_loaded() -> bool:
    return _catalog_status in {"ready", "refreshing"} and _catalog_products is not None


def get_catalog_status():
    return {
        "status": _catalog_status,
        "loaded": bool(_catalog_products is not None),
        "error": _catalog_error,
    }


def start_catalog_warmup(refresh_from_firestore=False):
    global _catalog_status, _catalog_error, _catalog_warmup_started

    if not refresh_from_firestore and _catalog_cache_is_fresh():
        return False

    with _catalog_load_lock:
        if not refresh_from_firestore and _catalog_cache_is_fresh():
            return False
        if _catalog_warmup_started:
            return False
        _catalog_warmup_started = True
        _catalog_status = "refreshing" if _catalog_products is not None else "warming"
        _catalog_error = ""

    def _worker():
        try:
            if _catalog_products is None:
                _load_metadata_catalog()
            if refresh_from_firestore and db is not None:
                _load_catalog_products(force_refresh=True)
        except Exception:
            pass
        finally:
            global _catalog_warmup_started
            _catalog_warmup_started = False

    Thread(target=_worker, daemon=True).start()
    return True


def warm_catalog_cache():
    if _catalog_products is None:
        try:
            _load_metadata_catalog()
        except Exception:
            _load_catalog_products()
    category_counts()


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
    image = _clean_image(str(product.get("image") or product.get("image_link") or product.get("imageUrl") or "").strip())
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
    }
    if product.get("raw"):
        payload["raw"] = product.get("raw")
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


def list_firestore_product_documents():
    if db is None:
        return []

    return _run_firestore_read(
        lambda timeout: list(db.collection(PRODUCTS_COLLECTION).stream(timeout=timeout)),
        [],
    )


def delete_firestore_products(doc_ids):
    unique_doc_ids = [str(doc_id).strip() for doc_id in doc_ids or [] if str(doc_id).strip()]
    if db is None:
        return {"deleted": 0, "available": False}
    if not unique_doc_ids:
        return {"deleted": 0, "available": True}

    deleted = 0
    batch = db.batch()
    for index, doc_id in enumerate(dict.fromkeys(unique_doc_ids), start=1):
        doc_ref = db.collection(PRODUCTS_COLLECTION).document(doc_id)
        batch.delete(doc_ref)
        if index % 400 == 0:
            batch.commit()
            batch = db.batch()
        deleted += 1

    batch.commit()
    invalidate_catalog_cache()
    return {"deleted": deleted, "available": True}


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
        "cacheCollection": WEB_CACHE_COLLECTION,
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
