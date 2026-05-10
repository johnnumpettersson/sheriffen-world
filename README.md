# Sheriffen World with Persistent Uploads

This project is a React + TypeScript gallery/map application with persistent image uploads using:

- Node.js API server (Express)
- MinIO object storage (S3-compatible)
- Docker Compose for local orchestration

## What Persistence Means Here

Uploaded files are no longer only in browser memory.

- Images are uploaded to MinIO.
- Image metadata is stored in MinIO as `manifest.json`.
- On app load, the frontend fetches persisted images from `/api/images`.

## Large File Uploads

The app now supports chunked uploads for very large image files (for example multi-GB files).

- The frontend initializes an upload session.
- The file is split into chunks and uploaded sequentially.
- The server streams chunks into object storage on finalize.
- Active upload sessions are persisted in browser storage so interrupted uploads can resume after page reload when the same file is selected again.

This avoids loading full large files into server memory and bypasses the old single-request multipart limit.

## Run With Docker

1. Build and start services:

```bash
docker compose up --build
```

2. Open the app:

- App/API: http://localhost:8080
- MinIO API: http://localhost:9000
- MinIO Console: http://localhost:9001

3. MinIO default credentials:

- Username: `minioadmin`
- Password: `minioadmin`

Data is persisted in the `minio-data` named Docker volume.

## Deploy To Railway (Two Services)

Use two Railway services from this same repository:

1. `app` service
2. `minio` service

### 1) MinIO Service

- Create a new Railway service from this repo.
- Set Dockerfile path to `Dockerfile.minio`.
- Add environment variables:
  - `MINIO_ROOT_USER` (example: `minioadmin`)
  - `MINIO_ROOT_PASSWORD` (use a strong value)
- Add a persistent volume mounted at `/data`.
- Expose internal port `9000` (S3 API).
- Optional: expose internal port `9001` (MinIO console).

### 2) App Service

- Create or update your app Railway service.
- Set Dockerfile path to `Dockerfile`.
- Configure these environment variables:
  - `PORT=8080`
  - `MINIO_ENDPOINT=<private domain of minio service>`
  - `MINIO_PORT=9000`
  - `MINIO_USE_SSL=false`
  - `MINIO_ACCESS_KEY=<same as MINIO_ROOT_USER>`
  - `MINIO_SECRET_KEY=<same as MINIO_ROOT_PASSWORD>`
  - `MINIO_BUCKET=gallery-images`
  - `UPLOAD_USERNAME=<your username>`
  - `UPLOAD_PASSWORD=<your password>`
  - `UPLOAD_AUTH_SECRET=<long random secret>`
  - `UPLOAD_AUTH_TTL_SECONDS=86400`

### 3) Verify

- Open your app domain and call `/api/health`.
- Call `/api/images` and verify it no longer returns 500.
- Log in and verify upload + metadata save.

### 4) Railway Redeploy Commands

Use these commands from the repo root after linking Railway CLI to the project:

```bash
railway up -s minio -d
railway up -s sheriffen-world -d
```

Important:

- Redeploy `minio` with `railway up -s minio -d` so Railway uses `Dockerfile.minio`.
- Do not rely on the generic `railway service redeploy -s minio` flow for MinIO, because it can fall back to the image-only service configuration and lose the required startup command.
- Redeploy MinIO first, then redeploy the app service.

### 5) Rotate MinIO Credentials Safely

When rotating MinIO credentials on Railway, update both services in this order:

1. Set new `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` on the `minio` service.
2. Set matching `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` on the app service.
3. Redeploy MinIO from the repo:

```bash
railway up -s minio -d
```

4. Redeploy the app service:

```bash
railway up -s sheriffen-world -d
```

5. Verify:

- `GET /api/health`
- `GET /api/images`
- `POST /api/auth/login`

If the app is redeployed before MinIO is healthy, expect storage-related failures until both services are back on matching credentials.

## Local Development Without Docker

1. Start MinIO (either via Docker or your own instance).
2. Start API server:

```bash
npm run server
```

3. Start frontend dev server:

```bash
npm run dev
```

Vite proxies `/api` to `http://localhost:8080`.

## Environment Variables (API)

- `PORT` (default: `8080`)
- `MINIO_ENDPOINT` (default: `minio`)
- `MINIO_PORT` (default: `9000`)
- `MINIO_USE_SSL` (default: `false`)
- `MINIO_ACCESS_KEY` (default: `minioadmin`)
- `MINIO_SECRET_KEY` (default: `minioadmin`)
- `MINIO_BUCKET` (default: `gallery-images`)
- `CORS_ORIGIN` (default: `*`)
- `UPLOAD_USERNAME` (default: `sheriffen`)
- `UPLOAD_PASSWORD` (default: `sheriffen123!`)
- `UPLOAD_AUTH_SECRET` (recommended in production; used to sign upload auth tokens)
- `UPLOAD_AUTH_TTL_SECONDS` (default: `86400`)
- `UPLOAD_CHUNK_SIZE_BYTES` (default: `8388608`, chunk size for large uploads)
- `UPLOAD_SESSION_TTL_MS` (default: `86400000`, max idle age before abandoned upload sessions are cleaned)

## API Endpoints

- `GET /api/health`
- `GET /api/images`
- `GET /api/geocode/reverse?lat={lat}&lng={lng}`
- `POST /api/upload` (multipart form field name: `image`)
- `POST /api/uploads/initiate` (chunked upload init, requires upload auth token)
- `PUT /api/uploads/:uploadId/chunks/:chunkIndex` (chunk binary upload, requires upload auth token)
- `GET /api/uploads/:uploadId/status` (chunk upload status for resume, requires upload auth token)
- `POST /api/uploads/:uploadId/complete` (finalize chunked upload, requires upload auth token)
- `DELETE /api/uploads/:uploadId` (abort and clean up chunked upload session, requires upload auth token)
- `PATCH /api/images/:id` (JSON metadata update, requires upload auth token)
- `GET /api/images/:id/file`
- `GET /api/images/:id/thumbnail`
- `GET /api/images/:id/preview`
- `DELETE /api/images/:id`
