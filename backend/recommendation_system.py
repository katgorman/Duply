import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
METADATA_PATH = BASE_DIR / "cosmetics_metadata.json"
MODEL_DIR = BASE_DIR / "cosmetics_dupe_model"
INDEX_PATH = BASE_DIR / "cosmetics_index.faiss"


def _default_model_mode():
    explicit_mode = os.getenv("DUPLY_MODEL_MODE", "").strip().lower()
    if explicit_mode:
        return explicit_mode

    # Render's smaller instances can restart when the local transformer model is
    # loaded on demand. Favor the metadata fallback there unless explicitly
    # opted back into the local model.
    if os.getenv("RENDER"):
        return "disabled"

    return "auto"


MODEL_MODE = _default_model_mode()

_products = None
_model = None
_index = None
_model_status = "uninitialized"
_model_error = ""


def _load_products():
    global _products

    if _products is not None:
      return _products

    with open(METADATA_PATH, "r", encoding="utf-8") as f:
        _products = json.load(f)

    return _products


def normalize_text(value):
    if value is None:
        return ""
    return str(value).strip().lower()


def canonical_type(value):
    value = normalize_text(value)

    mapping = {
        "foundation": "foundation",
        "concealer": "concealer",
        "blush": "blush",
        "bronzer": "bronzer",
        "powder": "powder",
        "primer": "primer",
        "highlighter": "highlighter",
        "lipstick": "lipstick",
        "lip gloss": "lipstick",
        "lip_gloss": "lipstick",
        "lip stain": "lipstick",
        "eyeshadow": "eyeshadow",
        "eye shadow": "eyeshadow",
        "eyeliner": "eyeliner",
        "eye liner": "eyeliner",
        "mascara": "mascara",
        "brow": "eyebrow",
        "eyebrow": "eyebrow",
        "nail polish": "nail_polish",
        "nail_polish": "nail_polish",
    }

    return mapping.get(value, value)


VALID_PRODUCT_TYPES = {
    "foundation", "concealer", "blush", "bronzer", "powder",
    "primer", "highlighter", "lipstick", "eyeshadow",
    "eyeliner", "mascara", "eyebrow", "nail_polish"
}


def infer_candidate_type(product):
    raw_subcategory = canonical_type(product.get("subcategory"))
    raw_type = canonical_type(product.get("type"))
    raw_category = canonical_type(product.get("category"))
    raw_name = normalize_text(product.get("product_name"))

    if raw_subcategory in VALID_PRODUCT_TYPES:
        return raw_subcategory

    if raw_type in VALID_PRODUCT_TYPES:
        return raw_type

    if raw_category in VALID_PRODUCT_TYPES:
        return raw_category

    name_rules = [
        ("foundation", "foundation"),
        ("concealer", "concealer"),
        ("blush", "blush"),
        ("bronzer", "bronzer"),
        ("powder", "powder"),
        ("primer", "primer"),
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
    ]

    for needle, result in name_rules:
        if needle in raw_name:
            return result

    return ""


def infer_query_type(query):
    return infer_candidate_type({
        "product_name": query,
        "category": query,
        "type": query,
    })


def _same_product(a, b):
    if not a or not b:
        return False

    return (
        normalize_text(a.get("brand")) == normalize_text(b.get("brand")) and
        normalize_text(a.get("product_name")) == normalize_text(b.get("product_name"))
    )


def lookup_product(query, preferred_type=None):
    query = normalize_text(query)
    preferred_type = canonical_type(preferred_type)

    best_match = None
    best_score = 0

    for product in _load_products():
        text = normalize_text(f"{product.get('brand', '')} {product.get('product_name', '')}")
        candidate_type = infer_candidate_type(product)

        if preferred_type and candidate_type and candidate_type != preferred_type:
            continue

        score = sum(1 for word in query.split() if word in text)

        if score > best_score:
            best_score = score
            best_match = product

    if best_score >= 2:
        return best_match

    return None


def build_query_text(query, preferred_type=None):
    product = lookup_product(query, preferred_type=preferred_type)

    if product and product.get("combined_text"):
        return product["combined_text"], product

    return query, None


def _keyword_similarity(query_text, candidate):
    haystack = normalize_text(
        " ".join([
            candidate.get("brand", ""),
            candidate.get("product_name", ""),
            candidate.get("category", ""),
            candidate.get("subcategory", ""),
            candidate.get("combined_text", ""),
        ])
    )
    tokens = [token for token in normalize_text(query_text).split() if token]

    if not haystack or not tokens:
        return 0.0

    score = 0.0
    for token in tokens:
        if token in haystack:
            score += 1.0

    return score / len(tokens)


def _fallback_find_dupes(query, k=5, preferred_type=None):
    target_type = canonical_type(preferred_type)
    if target_type not in VALID_PRODUCT_TYPES:
        target_type = ""

    query_text, original_product = build_query_text(query, preferred_type=target_type or None)

    if not target_type:
        if original_product:
            target_type = infer_candidate_type(original_product)
        else:
            target_type = infer_query_type(query)

    scored = []
    for product in _load_products():
        if _same_product(product, original_product):
            continue

        candidate_type = infer_candidate_type(product)
        if target_type and candidate_type != target_type:
            continue

        similarity = _keyword_similarity(query_text, product)
        if similarity <= 0:
            continue

        scored.append((similarity, product))

    scored.sort(
        key=lambda item: (
            -item[0],
            normalize_text(item[1].get("brand")),
            normalize_text(item[1].get("product_name")),
        )
    )

    results = []
    for score, candidate in scored[:k]:
        results.append({
            "record": candidate,
            "score": float(round(score, 4)),
        })

    return results


def _ensure_local_model():
    global _model, _index, _model_status, _model_error

    if _model_status == "ready":
        return True

    if _model_status == "failed":
        return False

    if MODEL_MODE == "disabled":
        _model_status = "failed"
        _model_error = "Local model explicitly disabled"
        return False

    try:
        import faiss
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer(str(MODEL_DIR))
        _index = faiss.read_index(str(INDEX_PATH))
        _model_status = "ready"
        return True
    except Exception as exc:
        _model_status = "failed"
        _model_error = str(exc)
        _model = None
        _index = None
        return False


def _collect_results(ids, scores, original_product, target_type=None, k=5):
    results = []
    products = _load_products()

    for idx, score in zip(ids[0], scores[0]):
        if idx < 0 or idx >= len(products):
            continue

        candidate = products[idx]

        if _same_product(candidate, original_product):
            continue

        candidate_type = infer_candidate_type(candidate)
        if target_type and candidate_type != target_type:
            continue

        results.append({
            "record": candidate,
            "score": float(score),
        })

        if len(results) >= k:
            break

    return results


def get_recommendation_mode():
    if _model_status == "ready":
        return "local-model"
    if MODEL_MODE == "disabled":
        return "metadata-fallback"
    if _model_status == "failed":
        return "metadata-fallback"
    return "auto"


def get_recommendation_status():
    return {
        "mode": get_recommendation_mode(),
        "modelStatus": _model_status,
        "modelError": _model_error,
    }


def find_dupes(query, k=5, search_pool=50, preferred_type=None):
    target_type = canonical_type(preferred_type)
    if target_type not in VALID_PRODUCT_TYPES:
        target_type = ""

    query_text, original_product = build_query_text(query, preferred_type=target_type or None)

    if not target_type:
        if original_product:
            target_type = infer_candidate_type(original_product)
        else:
            target_type = infer_query_type(query)

    if not _ensure_local_model():
        return _fallback_find_dupes(query, k=k, preferred_type=preferred_type)

    embedding = _model.encode(
        [query_text],
        normalize_embeddings=True
    ).astype("float32")

    scores, ids = _index.search(embedding, search_pool)

    return _collect_results(
        ids=ids,
        scores=scores,
        original_product=original_product,
        target_type=target_type or None,
        k=k,
    )
