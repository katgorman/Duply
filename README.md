# Duply

Duply is an Expo + React Native beauty dupe app with a FastAPI backend.

The app uses:
- local/backend-powered product search
- metadata-backed product pages
- model-ranked dupe comparisons
- local favorites, profile, recent searches, and recent views

## Stack

- Frontend: Expo, React Native, Expo Router, TypeScript
- Backend: FastAPI, sentence-transformers, FAISS
- Product data: `backend/cosmetics_metadata.json`
- Local persistence: AsyncStorage

## Repo Setup

### 1. Clone

```bash
git clone https://github.com/GraceLessig/Duply.git
cd Duply
```

### 2. Frontend install

```bash
npm install
```

### 3. Backend install

Create a Python virtual environment inside `backend/`, then install the backend dependencies:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

On macOS/Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## Firebase Credentials

Do not commit Firebase service account JSON files.

Create a Firebase Admin SDK service account key and either:

1. Place it at:

```text
backend/firebase-service-account.json
```

2. Or point to it with an environment variable:

```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\path\to\firebase-service-account.json"
```

There is an example file at:

```text
backend/.env.example
```

## Run The Backend

From the repo root on Windows:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

On macOS/Linux:

```bash
cd backend
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

## Run The Frontend

From the repo root:

```bash
npm start
```

Or:

```bash
npm run web
npm run android
npm run ios
```

## Project Notes

- Product suggestions and category browsing are backed by the local cosmetics metadata index for speed.
- Product details and dupe logic are resolved through the backend.
- The backend expects `backend/cosmetics_metadata.json`, `backend/cosmetics_index.faiss`, and `backend/cosmetics_dupe_model/` to be present.
- Firebase credentials are local-only and intentionally ignored by Git.


