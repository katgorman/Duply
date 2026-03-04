import os
import re
import pandas as pd
import numpy as np
import kagglehub
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity


def download_dataset(dataset_name: str, filename: str) -> pd.DataFrame:
    """Download Kaggle dataset and load as pandas DataFrame."""
    dataset_path = kagglehub.dataset_download(dataset_name)
    file_path = os.path.join(dataset_path, filename)
    df = pd.read_csv(file_path, encoding='latin-1')
    print(f"Dataset loaded: {file_path}")
    # print("Columns in CSV:", df.columns.tolist())
    return df


def clean_text(text: str) -> str:
    """Lowercase, remove punctuation, and extra whitespace."""
    if pd.isna(text):
        return ""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def create_combined_text(df: pd.DataFrame, desired_fields: list) -> pd.Series:
    """Combine multiple text fields into a single cleaned text column."""
    # Only use fields that actually exist in the DataFrame
    fields_to_use = [f for f in desired_fields if f in df.columns]
    print("Using fields for combined_text:", fields_to_use)
    combined = df[fields_to_use].fillna('').agg(' '.join, axis=1)
    return combined.apply(clean_text)


def compute_embeddings(texts: list, model_name='paraphrase-MiniLM-L6-v2') -> np.ndarray:
    """Compute normalized embeddings for a list of texts."""
    model = SentenceTransformer(model_name)
    return model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)


def generate_pairs(embeddings: np.ndarray, pos_thresh=0.85, neg_thresh=0.3,
                   categories=None) -> tuple[list, list]:
    """Generate positive and negative pairs based on cosine similarity."""
    cos_sim_matrix = cosine_similarity(embeddings)
    n = len(embeddings)
    
    pos_pairs = []
    neg_pairs = []

    for i in range(n):
        # Positive pairs
        similar_idx = np.where(cos_sim_matrix[i, i+1:] > pos_thresh)[0] + (i+1)
        for j in similar_idx:
            if categories is None or categories[i] == categories[j]:
                pos_pairs.append((i, j))
        
        # Negative pairs
        dissimilar_idx = np.where(cos_sim_matrix[i, :] < neg_thresh)[0]
        for j in dissimilar_idx:
            if i != j:
                neg_pairs.append((i, j))

    return pos_pairs, neg_pairs


def main():
    # 1. Load dataset
    df = download_dataset(
        "devi5723/e-commerce-cosmetics-dataset",
        "E-commerce  cosmetic dataset.csv"
    )

    # 2. Create combined_text column safely
    desired_fields = ['brand', 'product_name', 'category', 'shades', 'ingredients', 'form', 'type', 'color']
    df['combined_text'] = create_combined_text(df, desired_fields)

    # 3. Compute embeddings
    texts = df['combined_text'].tolist()
    embeddings = compute_embeddings(texts)

    # 4. Generate positive and negative pairs
    categories = df['category'].tolist() if 'category' in df.columns else None
    pos_pairs, neg_pairs = generate_pairs(
        embeddings, pos_thresh=0.85, neg_thresh=0.3, categories=categories
    )

    print(f"Generated {len(pos_pairs)} positive pairs and {len(neg_pairs)} negative pairs.")


if __name__ == "__main__":
    main()