import faiss
import json
import numpy as np
from sentence_transformers import SentenceTransformer


# LOAD MODEL + INDEX + METADATA
model = SentenceTransformer("cosmetics_dupe_model")

index = faiss.read_index("cosmetics_index.faiss")

with open("cosmetics_metadata.json", "r", encoding="utf-8") as f:
    products = json.load(f)


# PRODUCT LOOKUP
def lookup_product(query):

    query = query.lower()

    best_match = None
    best_score = 0

    for product in products:

        text = f"{product['brand']} {product['product_name']}".lower()

        score = 0

        for word in query.split():
            if word in text:
                score += 1

        if score > best_score:
            best_score = score
            best_match = product

    if best_score >= 2:  # at least 2 matching words
        return best_match

    return None


# BUILD QUERY TEXT
def build_query_text(query):

    product = lookup_product(query)

    if product:
        return product["combined_text"], product

    return query, None


# DUPE SEARCH
def find_dupes(query, k=5, search_pool=50):

    query_text, original_product = build_query_text(query)

    embedding = model.encode(
        [query_text],
        normalize_embeddings=True
    ).astype("float32")

    scores, ids = index.search(embedding, search_pool)

    results = []

    target_category = None
    target_subcategory = None

    if original_product:
        target_category = original_product.get("category")
        target_subcategory = original_product.get("type")

    for idx, score in zip(ids[0], scores[0]):

        candidate = products[idx]

        # remove identical product
        if original_product:
            if (
                candidate["brand"] == original_product["brand"]
                and candidate["product_name"] == original_product["product_name"]
            ):
                continue

        # filter by category
        if target_category and candidate.get("category") != target_category:
            continue

        # filter by subcategory
        if target_subcategory and candidate.get("type") != target_subcategory:
            continue

        results.append({
            "brand": candidate["brand"],
            "product_name": candidate["product_name"],
            "category": candidate.get("category"),
            "type": candidate.get("type"),
            "score": float(score)
        })

        if len(results) >= k:
            break

    return results


# SIMPLE CLI TEST
if __name__ == "__main__":

    query = input("Search product: ")

    dupes = find_dupes(query)

    print("\nTop dupes:\n")

    for d in dupes:
        print(f"{d['brand']} - {d['product_name']} ({d['score']:.3f})")