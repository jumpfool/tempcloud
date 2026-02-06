# tempcloud

Temporary file-sharing app with password protection and link expiration
**Backend:** Cloudflare Workers (Hono) + R2 (file storage) + KV (metadata)
**Frontend:** Next.js

**Features:**
- Temporary files with TTL and optional max-downloads
- Optional password-protected downloads
- One-time download support

**Repository layout**
- [backend](backend) — Cloudflare Worker, `wrangler.toml`, `src/index.ts`
- [frontend](frontend) — Next.js app, `src/` and `src/lib/api.ts`

## Prerequisites
- Node.js (18+)
- Cloudflare account with R2 bucket and KV namespace
- Wrangler CLI (`npm i -D wrangler@4` recommended)

## Backend — prepare & deploy

1. Create an R2 bucket (via Cloudflare dashboard) — example name: `tempcloud-files`.
2. Create a KV namespace and note the `id` and (optionally) `preview_id`.
3. Edit `[bindings]` in [backend/wrangler.toml](backend/wrangler.toml) to set the R2 binding and KV namespace IDs.
4. Set `BASE_URL` in [backend/wrangler.toml](backend/wrangler.toml) to the worker domain you will publish (or leave as `http://localhost:8787` for local dev).
5. Publish the worker:

```bash
cd backend
npx wrangler deploy
```

After deploy you will get a `https://<name>.<your-subdomain>.workers.dev` URL.

## Frontend — local dev and production

1. In `frontend/.env.local` set:

```
NEXT_PUBLIC_API_URL=https://<your-worker>.workers.dev
```

2. Install and run locally:

```bash
cd frontend
npm install
npm run dev
```

3. Build for production:

```bash
npm run build
npm run start
```

## How upload flow works
- Frontend calls `POST /api/v1/upload/init` to create a file record and get an upload URL.
- The Worker proxies the upload (PUT) into R2.
- After upload the frontend calls `POST /api/v1/upload/finalize` to mark the file active.

Example upload-init (JSON) request: POST to `/api/v1/upload/init` with filename/size/mime.

Download URL format (frontend uses):
`https://<worker>/d/<uuid>` — this redirects to the worker download endpoint and handles password checks.

## Important production notes
- CORS: Worker sets CORS headers; if you host frontend on another domain update `CORS_ORIGIN` in `wrangler.toml`.
- Limits: `MAX_FILE_SIZE` in `wrangler.toml` controls max upload size.
- Cleanup: the worker sets TTLs (KV `expiration`) for automatic cleanup of metadata.

## Troubleshooting
- If upload PUTs point to `http://localhost:8787`, set `BASE_URL` in [backend/wrangler.toml](backend/wrangler.toml) to the deployed worker domain and redeploy.
- If CORS errors occur, ensure `CORS_ORIGIN` allows your frontend origin and redeploy the worker.

## Where to look in the code
- Backend routes and logic: [backend/src/index.ts](backend/src/index.ts)
- Types and env bindings: [backend/src/types.ts](backend/src/types.ts)
- Frontend API client: [frontend/src/lib/api.ts](frontend/src/lib/api.ts)
- Frontend pages: [frontend/src/app/page.tsx](frontend/src/app/page.tsx) and [frontend/src/app/d/[uuid]/page.tsx](frontend/src/app/d/%5Buuid%5D/page.tsx)

---
