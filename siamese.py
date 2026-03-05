import os
import re
import random
import json
import pandas as pd
import numpy as np
import kagglehub
import torch
import faiss

from sentence_transformers import SentenceTransformer, InputExample, losses
from torch.utils.data import DataLoader


 
# 1. DATA LOADING
def download_dataset(dataset_name: str, filename: str) -> pd.DataFrame:
    dataset_path = kagglehub.dataset_download(dataset_name)
    file_path = os.path.join(dataset_path, filename)

    df = pd.read_csv(file_path, encoding="utf-8")

    print(f"Dataset loaded: {file_path}")
    return df


def clean_text(text: str) -> str:

    if pd.isna(text):
        return ""

    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    return text


def create_combined_text(df: pd.DataFrame, fields: list) -> pd.Series:

    fields_to_use = [f for f in fields if f in df.columns]

    combined = (
        df[fields_to_use]
        .fillna("")
        .agg(" ".join, axis=1)
        .apply(clean_text)
    )

    return combined


# 2. POSITIVE PAIR GENERATION
def generate_positive_pairs(df, max_pairs_per_item=3):

    examples = []

    grouped = df.groupby("category")

    for _, group in grouped:

        texts = group["combined_text"].tolist()

        for i in range(len(texts)):

            candidates = list(range(len(texts)))
            candidates.remove(i)

            random.shuffle(candidates)

            for j in candidates[:max_pairs_per_item]:

                examples.append(
                    InputExample(texts=[texts[i], texts[j]])
                )

    print(f"Created {len(examples)} positive training pairs")

    return examples


# 3. MODEL TRAINING
def train_model(df):

    device = "cuda" if torch.cuda.is_available() else "cpu"

    model = SentenceTransformer(
        "paraphrase-MiniLM-L6-v2",
        device=device
    )

    train_examples = generate_positive_pairs(df)

    train_loader = DataLoader(
        train_examples,
        shuffle=True,
        batch_size=32
    )

    train_loss = losses.MultipleNegativesRankingLoss(model)

    model.fit(
        train_objectives=[(train_loader, train_loss)],
        epochs=4,
        warmup_steps=100,
        show_progress_bar=True
    )

    model.save("cosmetics_dupe_model")

    print("Model saved.")

    return model

# 4. BUILD FAISS VECTOR DATABASE
def build_faiss_index(model, df):

    print("Generating embeddings...")

    embeddings = np.load("final_embeddings.npy")

    dim = embeddings.shape[1]

    print("Building FAISS index...")

    index = faiss.IndexFlatIP(dim)   # cosine similarity
    index.add(embeddings)

    faiss.write_index(index, "cosmetics_index.faiss")

    print("FAISS index saved.")

    # Save metadata
    df.reset_index(drop=True).to_json(
        "cosmetics_metadata.json",
        orient="records"
    )

    print("Metadata saved.")

    return index


# 5. LOAD DATABASE
def load_faiss_index():

    index = faiss.read_index("cosmetics_index.faiss")

    with open("cosmetics_metadata.json") as f:
        metadata = json.load(f)

    return index, metadata


# 6. QUERY PIPELINE
def query_similar_products(query_text, model, index, metadata, k=5):

    query_text = clean_text(query_text)

    query_embedding = model.encode(
        [query_text],
        convert_to_numpy=True,
        normalize_embeddings=True
    )

    scores, indices = index.search(query_embedding, k)

    results = []

    for score, idx in zip(scores[0], indices[0]):

        product = metadata[idx]

        results.append({
            "product_name": product.get("product_name"),
            "brand": product.get("brand"),
            "category": product.get("category"),
            "similarity": float(score)
        })

    return results


# 7. MAIN PIPELINE
def main():

    df = download_dataset(
        "devi5723/e-commerce-cosmetics-dataset",
        "E-commerce  cosmetic dataset.csv"
    )

    fields = [
        "brand",
        "product_name",
        "category",
        "shades",
        "ingredients",
        "form",
        "type",
        "color"
    ]

    df["combined_text"] = create_combined_text(df, fields)

    df = df[df["combined_text"].str.len() > 0].reset_index(drop=True)

    # model = train_model(df)
    model = SentenceTransformer("cosmetics_dupe_model")

    build_faiss_index(model, df)

    print("Pipeline complete.")


if __name__ == "__main__":
    main()