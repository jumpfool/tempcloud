const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8787";

export interface UploadInitRequest {
  filename: string;
  size: number;
  mime?: string;
  expires_in?: number;
  max_downloads?: number;
  password?: string;
}

export interface UploadInitResponse {
  upload_url: string;
  file_uuid: string;
  expires_at: number;
}

export interface UploadFinalizeResponse {
  download_link: string;
  status: "active";
}

export interface FileInfoResponse {
  filename: string;
  size: number;
  mime: string;
  uploaded_at: number;
  expires_at: number;
  downloads_left: number | null;
  has_password: boolean;
}

export interface ApiError {
  error: string;
  code: string;
}

export async function initUpload(
  data: UploadInitRequest
): Promise<UploadInitResponse> {
  const res = await fetch(`${API_BASE}/api/v1/upload/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err: ApiError = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function uploadFile(
  uploadUrl: string,
  file: Blob,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
    xhr.send(file);
  });
}

export async function finalizeUpload(
  fileUuid: string
): Promise<UploadFinalizeResponse> {
  const res = await fetch(`${API_BASE}/api/v1/upload/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_uuid: fileUuid }),
  });
  if (!res.ok) {
    const err: ApiError = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function getFileInfo(uuid: string): Promise<FileInfoResponse> {
  const res = await fetch(`${API_BASE}/api/v1/file/${uuid}/info`);
  if (!res.ok) {
    const err: ApiError = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function downloadFile(
  uuid: string,
  password?: string
): Promise<{ ok: true; blob: Blob; filename: string } | { ok: false; error: string; code: string }> {
  const url = getDownloadUrl(uuid, password);
  const res = await fetch(url);
  if (!res.ok) {
    try {
      const err: ApiError = await res.json();
      return { ok: false, error: err.error, code: err.code };
    } catch {
      return { ok: false, error: "Download failed", code: "UNKNOWN" };
    }
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  let filename = "download";
  
  const filenameMatch = disposition.match(/filename\*?=["']?(?:UTF-\d['"])?([^;\r\n"']+)["']?/i);
  if (filenameMatch && filenameMatch[1]) {
    filename = decodeURIComponent(filenameMatch[1].trim());
  }
  
  return { ok: true, blob, filename };
}

export function getDownloadUrl(uuid: string, password?: string): string {
  const params = password ? `?password=${encodeURIComponent(password)}` : "";
  return `${API_BASE}/api/v1/file/${uuid}/download${params}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatTimeLeft(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = expiresAt - now;
  if (diff <= 0) return "Expired";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
