import os
import re
import pickle
import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer, InputExample, losses
from sklearn.metrics.pairwise import cosine_similarity
import kagglehub
import torch
from torch.utils.data import DataLoader

# -----------------------------
# 1. Data Loading & Cleaning
# -----------------------------
def download_dataset(dataset_name: str, filename: str) -> pd.DataFrame:
    dataset_path = kagglehub.dataset_download(dataset_name)
    file_path = os.path.join(dataset_path, filename)
    df = pd.read_csv(file_path, encoding='latin-1')
    print(f"Dataset loaded: {file_path}")
    return df

def clean_text(text: str) -> str:
    if pd.isna(text):
        return ""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def create_combined_text(df: pd.DataFrame, desired_fields: list, cache_file="combined_text.pkl") -> pd.Series:
    if os.path.exists(cache_file):
        print("Loading cached combined text...")
        return pd.read_pickle(cache_file)
    fields_to_use = [f for f in desired_fields if f in df.columns]
    combined = df[fields_to_use].fillna('').agg(' '.join, axis=1).apply(clean_text)
    combined.to_pickle(cache_file)
    print(f"Combined text cached to {cache_file}")
    return combined

# -----------------------------
# 2. Pair Generation & Caching
# -----------------------------
def compute_embeddings(texts: list, model_name='paraphrase-MiniLM-L6-v2', cache_file="pair_gen_embeddings.npy") -> np.ndarray:
    if os.path.exists(cache_file):
        print(f"Loading cached embeddings from {cache_file}")
        return np.load(cache_file)
    print("Computing embeddings for pair generation...")
    model = SentenceTransformer(model_name)
    embeddings = model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
    np.save(cache_file, embeddings)
    print(f"Embeddings cached to {cache_file}")
    return embeddings

def generate_pairs(embeddings: np.ndarray, categories=None, pos_thresh=0.85, neg_thresh=0.3, cache_file="pairs.pkl"):
    if os.path.exists(cache_file):
        print(f"Loading cached pairs from {cache_file}")
        with open(cache_file, "rb") as f:
            data = pickle.load(f)
        return data["pos"], data["neg"]
    
    print("Generating positive and negative pairs...")
    cos_sim_matrix = cosine_similarity(embeddings)
    n = len(embeddings)
    pos_pairs, neg_pairs = [], []

    for i in range(n):
        similar_idx = np.where(cos_sim_matrix[i, i+1:] > pos_thresh)[0] + (i+1)
        for j in similar_idx:
            if categories is None or categories[i] == categories[j]:
                pos_pairs.append((i, j))
        dissimilar_idx = np.where(cos_sim_matrix[i, :] < neg_thresh)[0]
        for j in dissimilar_idx:
            if i != j:
                neg_pairs.append((i, j))

    with open(cache_file, "wb") as f:
        pickle.dump({"pos": pos_pairs, "neg": neg_pairs}, f)
    print(f"Pairs cached to {cache_file}")
    return pos_pairs, neg_pairs

# -----------------------------
# 3. Convert to InputExamples
# -----------------------------
def create_input_examples(df, pos_pairs, neg_pairs):
    examples = []
    texts = df['combined_text'].tolist()
    for i,j in pos_pairs:
        examples.append(InputExample(texts=[texts[i], texts[j]], label=1.0))
    for i,j in neg_pairs:
        examples.append(InputExample(texts=[texts[i], texts[j]], label=0.0))
    print(f"Created {len(examples)} InputExamples for training")
    return examples

# -----------------------------
# 4. Main Training Workflow
# -----------------------------
def main():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model_name = 'paraphrase-MiniLM-L6-v2'

    # 1️⃣ Load dataset
    df = download_dataset(
        "devi5723/e-commerce-cosmetics-dataset",
        "E-commerce  cosmetic dataset.csv"
    )
    desired_fields = ['brand', 'product_name', 'category', 'shades', 'ingredients', 'form', 'type', 'color']
    df['combined_text'] = create_combined_text(df, desired_fields)

    # 2. Compute embeddings for pair generation (cached)
    embeddings = compute_embeddings(df['combined_text'].tolist(), cache_file="pair_gen_embeddings.npy")

    # 3. Generate pairs (cached)
    categories = df['category'].tolist() if 'category' in df.columns else None
    pos_pairs, neg_pairs = generate_pairs(embeddings, categories, cache_file="pairs.pkl")

    # 4. Create InputExamples
    train_examples = create_input_examples(df, pos_pairs, neg_pairs)
    train_dataloader = DataLoader(train_examples, shuffle=True, batch_size=16)

    # 5. Define model and loss
    model = SentenceTransformer(model_name, device=device)
    train_loss = losses.ContrastiveLoss(model=model, margin=0.8)

    # 6. Train using SentenceTransformer fit()
    model.fit(
        train_objectives=[(train_dataloader, train_loss)],
        epochs=5,
        warmup_steps=100,
        show_progress_bar=True
    )

    # 7. Save final embeddings (cached)
    final_embeddings_file = "final_embeddings.npy"
    if not os.path.exists(final_embeddings_file):
        final_embeddings = model.encode(df['combined_text'].tolist(), convert_to_numpy=True, normalize_embeddings=True)
        np.save(final_embeddings_file, final_embeddings)
        print(f"Final embeddings cached to {final_embeddings_file}")
    else:
        print(f"Final embeddings already cached in {final_embeddings_file}")

    print("Training complete!")

if __name__ == "__main__":
    main()