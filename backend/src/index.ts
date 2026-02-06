import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, FileMetadata, UploadInitRequest, UploadFinalizeRequest } from "./types";
import { generateUUID, hashPassword, verifyPassword } from "./crypto";

const app = new Hono<{ Bindings: Env }>();

// middleware
app.use(
  "/api/*",
  cors({
    origin: (origin, c) => c.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-File-Password"],
    maxAge: 86400,
  })
);

// healthcheck
app.get("/", (c) => c.json({ status: "ok", service: "tempcloud" }));

// POST /api/v1/upload/init
app.post("/api/v1/upload/init", async (c) => {
  const body = await c.req.json<UploadInitRequest>().catch(() => null);

  if (!body || !body.filename || !body.size) {
    return c.json({ error: "Missing required fields: filename, size", code: "INVALID_REQUEST" }, 400);
  }

  const maxSize = parseInt(c.env.MAX_FILE_SIZE, 10);
  if (body.size > maxSize) {
    return c.json(
      { error: `File too large. Max size: ${maxSize} bytes`, code: "FILE_TOO_LARGE" },
      413
    );
  }

  const fileUUID = generateUUID();
  const r2Key = `uploads/${fileUUID}/${body.filename}`;

  // default ttfl
  const defaultTTL = parseInt(c.env.DEFAULT_FILE_TTL, 10);
  const expiresIn = body.expires_in && body.expires_in > 0 ? body.expires_in : defaultTTL;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + expiresIn;

  // hash if provided
  let passwordHash: string | null = null;
  if (body.password && body.password.length > 0) {
    passwordHash = await hashPassword(body.password);
  }

  // build metadata to persist later on finalize
  const metadata: FileMetadata = {
    filename: body.filename,
    size: body.size,
    mime: body.mime || "application/octet-stream",
    uploaded_at: now,
    expires_at: expiresAt,
    downloads_left: body.max_downloads && body.max_downloads > 0 ? body.max_downloads : null,
    password_hash: passwordHash,
    r2_key: r2Key,
  };

  // store metadata in KV as pending
  const kvKey = `pending:${fileUUID}`;
  await c.env.FILE_KV.put(kvKey, JSON.stringify(metadata), {
    // pending entries expire
    expirationTtl: 900,
  });
    // generate presigned upload URL proxied
  const presignedTTL = parseInt(c.env.PRESIGNED_URL_TTL, 10);
  const uploadUrl = `${c.env.BASE_URL}/api/v1/upload/put/${fileUUID}?expires=${now + presignedTTL}`;

  return c.json({
    upload_url: uploadUrl,
    file_uuid: fileUUID,
    expires_at: expiresAt,
  });
});

// PUT /api/v1/upload/put/:uuid
app.put("/api/v1/upload/put/:uuid", async (c) => {
  const uuid = c.req.param("uuid");
  const expiresParam = c.req.query("expires");

  // check expiry
  if (expiresParam) {
    const expiresAt = parseInt(expiresParam, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now > expiresAt) {
      return c.json({ error: "Upload URL expired", code: "UPLOAD_EXPIRED" }, 410);
    }
  }

  // retrieve pending metadata
  const kvKey = `pending:${uuid}`;
  const raw = await c.env.FILE_KV.get(kvKey);
  if (!raw) {
    return c.json({ error: "Upload session not found or expired", code: "NOT_FOUND" }, 404);
  }

  const metadata: FileMetadata = JSON.parse(raw);

  // stream the request body directly into R2
  const body = c.req.raw.body;
  if (!body) {
    return c.json({ error: "No file body provided", code: "EMPTY_BODY" }, 400);
  }

  await c.env.R2_BUCKET.put(metadata.r2_key, body, {
    httpMetadata: {
      contentType: metadata.mime,
    },
    customMetadata: {
      filename: metadata.filename,
      uuid: uuid,
    },
  });

  return c.json({ status: "uploaded", file_uuid: uuid });
});

// POST /api/v1/upload/finalize
app.post("/api/v1/upload/finalize", async (c) => {
  const body = await c.req.json<UploadFinalizeRequest>().catch(() => null);

  if (!body || !body.file_uuid) {
    return c.json({ error: "Missing required field: file_uuid", code: "INVALID_REQUEST" }, 400);
  }

  const pendingKey = `pending:${body.file_uuid}`;
  const raw = await c.env.FILE_KV.get(pendingKey);
  if (!raw) {
    return c.json(
      { error: "Upload session not found or already finalized", code: "NOT_FOUND" },
      404
    );
  }

  const metadata: FileMetadata = JSON.parse(raw);

  // verify the file actually landed in R2
  const r2Head = await c.env.R2_BUCKET.head(metadata.r2_key);
  if (!r2Head) {
    return c.json(
      { error: "File not found in storage. Did the upload complete?", code: "FILE_MISSING" },
      404
    );
  }

  // update size from actual R2 object
  metadata.size = r2Head.size;

  // compute KV TTL from expires_at
  const now = Math.floor(Date.now() / 1000);
  const ttl = metadata.expires_at - now;
  if (ttl <= 0) {
    return c.json({ error: "File has already expired", code: "EXPIRED" }, 410);
  }

  // move from pending to active
  const activeKey = `file:${body.file_uuid}`;
  await c.env.FILE_KV.put(activeKey, JSON.stringify(metadata), {
    expirationTtl: ttl,
  });

  // delete the pending entry
  await c.env.FILE_KV.delete(pendingKey);

  const downloadLink = `${c.env.BASE_URL}/d/${body.file_uuid}`;

  return c.json({
    download_link: downloadLink,
    status: "active" as const,
  });
});

// GET /api/v1/file/:uuid/info
app.get("/api/v1/file/:uuid/info", async (c) => {
  const uuid = c.req.param("uuid");
  const raw = await c.env.FILE_KV.get(`file:${uuid}`);

  if (!raw) {
    return c.json({ error: "File not found or expired", code: "NOT_FOUND" }, 404);
  }

  const metadata: FileMetadata = JSON.parse(raw);

  return c.json({
    filename: metadata.filename,
    size: metadata.size,
    mime: metadata.mime,
    uploaded_at: metadata.uploaded_at,
    expires_at: metadata.expires_at,
    downloads_left: metadata.downloads_left,
    has_password: metadata.password_hash !== null,
  });
});

// GET /api/v1/file/:uuid/download?password=xxx
app.get("/api/v1/file/:uuid/download", async (c) => {
  const uuid = c.req.param("uuid");
  const kvKey = `file:${uuid}`;
  const raw = await c.env.FILE_KV.get(kvKey);

  if (!raw) {
    return c.json({ error: "File not found or expired", code: "NOT_FOUND" }, 404);
  }

  const metadata: FileMetadata = JSON.parse(raw);

  // check expiry (KV TTL handles auto-delete, but double-check)
  const now = Math.floor(Date.now() / 1000);
  if (now > metadata.expires_at) {
    await c.env.FILE_KV.delete(kvKey);
    return c.json({ error: "File has expired", code: "EXPIRED" }, 410);
  }

  // check download limit
  if (metadata.downloads_left !== null && metadata.downloads_left <= 0) {
    // clean up
    await c.env.FILE_KV.delete(kvKey);
    await c.env.R2_BUCKET.delete(metadata.r2_key);
    return c.json({ error: "Download limit reached", code: "LIMIT_REACHED" }, 410);
  }

  // check password
  if (metadata.password_hash !== null) {
    const password = c.req.query("password") || c.req.header("X-File-Password") || "";
    if (!password) {
      return c.json({ error: "Password required", code: "PASSWORD_REQUIRED" }, 401);
    }
    const valid = await verifyPassword(password, metadata.password_hash);
    if (!valid) {
      return c.json({ error: "Invalid password", code: "INVALID_PASSWORD" }, 403);
    }
  }

  // decrement download counter
  if (metadata.downloads_left !== null) {
    metadata.downloads_left -= 1;
  }

  const isLastDownload = metadata.downloads_left !== null && metadata.downloads_left <= 0;

  // update KV with decremented counter (unless it's the last download)
  if (!isLastDownload && metadata.downloads_left !== null) {
    const ttl = metadata.expires_at - now;
    if (ttl > 0) {
      await c.env.FILE_KV.put(kvKey, JSON.stringify(metadata), { expirationTtl: ttl });
    }
  }

  // fetch files from R2 and stream to the client
  const r2Object = await c.env.R2_BUCKET.get(metadata.r2_key);
  if (!r2Object) {
    await c.env.FILE_KV.delete(kvKey);
    return c.json({ error: "File missing from storage", code: "FILE_MISSING" }, 404);
  }

  // if this was the last download, clean up AFTER streaming
  if (isLastDownload) {
    // We delete the KV entry now; R2 cleanup happens after response
    await c.env.FILE_KV.delete(kvKey);
    // schedule R2 cleanup via waitUntil (non-blocking)
    c.executionCtx.waitUntil(c.env.R2_BUCKET.delete(metadata.r2_key));
  }

  // stream the file back
  const headers = new Headers();
  headers.set("Content-Type", metadata.mime);
  headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(metadata.filename)}"`);
  headers.set("Content-Length", metadata.size.toString());
  headers.set("Cache-Control", "no-store");

  return new Response(r2Object.body, { status: 200, headers });
});

// GET /d/:uuid
app.get("/d/:uuid", async (c) => {
  const uuid = c.req.param("uuid");
  // redirect to the API download endpoint
  const redirectUrl = `${c.env.BASE_URL}/api/v1/file/${uuid}/download${c.req.url.includes("?") ? "?" + c.req.url.split("?")[1] : ""}`;
  return c.redirect(redirectUrl, 302);
});

// DELETE /api/v1/file/:uuid
app.delete("/api/v1/file/:uuid", async (c) => {
  const uuid = c.req.param("uuid");
  const kvKey = `file:${uuid}`;
  const raw = await c.env.FILE_KV.get(kvKey);

  if (!raw) {
    return c.json({ error: "File not found", code: "NOT_FOUND" }, 404);
  }

  const metadata: FileMetadata = JSON.parse(raw);

  // delete from R2 and KV
  await Promise.all([
    c.env.R2_BUCKET.delete(metadata.r2_key),
    c.env.FILE_KV.delete(kvKey),
  ]);

  return c.json({ status: "deleted" });
});

// 404
app.notFound((c) => c.json({ error: "Not found", code: "NOT_FOUND" }, 404));

// global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
});

export default app;
