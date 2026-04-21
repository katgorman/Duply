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
git clone https://github.com/katgorman/Duply.git
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

## Optional Cloud Credentials

You do not need Firebase credentials to run the app locally.

The app can run fully from the bundled metadata/model files in `backend/`.
If you later want to connect an external cloud product source, you can use:

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

## Short-Term Production Setup

If you want people to scan a QR code and use the app without your laptop running, you need two separate things:

1. A hosted backend that is running 24/7.
2. An Expo internal distribution build that points at that hosted backend.

### Frontend API Configuration

The app now supports an environment-based API URL.

For local development, you can keep using the automatic localhost detection.

For hosted builds, set:

```text
EXPO_PUBLIC_API_BASE_URL=https://your-backend-host.example.com
```

To surface an Android install button inside the web app, also set:

```text
EXPO_PUBLIC_ANDROID_APP_URL=https://expo.dev/artifacts/eas/your-android-build-link
```

You can place that in a local `.env` file for development, or in Expo EAS environment variables for cloud builds.

### Hosted Backend Secrets

Do not ship `backend/firebase-service-account.json` inside the mobile app.

The backend now supports three server-side credential methods:

1. `GOOGLE_APPLICATION_CREDENTIALS` pointing to a JSON file path on the server
2. `FIREBASE_SERVICE_ACCOUNT_JSON` containing the whole service account JSON as one environment variable
3. Split environment variables:
   `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

Use `backend/.env.example` as the template for hosted configuration.

### EAS Build Profiles

This repo now includes `eas.json` with these profiles:

- `development`: development client build for local debugging
- `preview`: internal distribution build for sharing via Expo build URL / QR code
- `production`: store-style build profile for later

For the short-term sharing flow, use the `preview` profile.

### Recommended Short-Term Hosting Flow

1. Deploy the FastAPI backend to a host that stays online all the time.
2. Add the Firebase admin credentials only to that backend host.
3. Build the Android app with EAS internal distribution.
4. Copy the final Android build URL from Expo.
5. Set `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_ANDROID_APP_URL` for your web build.
6. Export and host the web app publicly.
7. Put the public web URL into the flyer QR code.

### Example Backend Start Command

Once your Python dependencies are installed on the server, a typical production start command is:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

If your host runs commands from the repo root instead of the `backend/` folder, set the working directory to `backend` first.

### What You Must Keep Private

Never expose any of these to end users or commit them publicly:

- Firebase Admin service account JSON
- `FIREBASE_PRIVATE_KEY`
- any server-only secret environment variables

`EXPO_PUBLIC_API_BASE_URL` is safe to expose because it is just the public URL of your backend.

## Project Notes

- Product suggestions and category browsing are backed by the local cosmetics metadata index for speed.
- Product details and dupe logic are resolved through the backend.
- The backend expects `backend/cosmetics_metadata.json`, `backend/cosmetics_index.faiss`, and `backend/cosmetics_dupe_model/` to be present.
- Cloud credentials are optional and intentionally ignored by Git.
