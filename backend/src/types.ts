/** cf worker bindings */
export interface Env {
  R2_BUCKET: R2Bucket;
  FILE_KV: KVNamespace;
  BASE_URL: string;
  PRESIGNED_URL_TTL: string;
  DEFAULT_FILE_TTL: string;
  MAX_FILE_SIZE: string;
  CORS_ORIGIN: string;
}

/** metadata */
export interface FileMetadata {
  filename: string;
  size: number;
  mime: string;
  uploaded_at: number;
  expires_at: number;
  downloads_left: number | null; // null = unlimited
  password_hash: string | null; // null = no password
  r2_key: string;
}

/** /api/v1/upload/init */
export interface UploadInitRequest {
  filename: string;
  size: number;
  mime?: string;
  expires_in?: number; // seconds, default from env
  max_downloads?: number; // null/0 = unlimited
  password?: string; // optional password protection
}

/** /api/v1/upload/init */
export interface UploadInitResponse {
  upload_url: string;
  file_uuid: string;
  expires_at: number;
}

/** /api/v1/upload/finalize */
export interface UploadFinalizeRequest {
  file_uuid: string;
}

/** /api/v1/upload/finalize */
export interface UploadFinalizeResponse {
  download_link: string;
  status: "active";
}

/** /api/v1/file/:uuid/info */
export interface FileInfoResponse {
  filename: string;
  size: number;
  mime: string;
  uploaded_at: number;
  expires_at: number;
  downloads_left: number | null;
  has_password: boolean;
}

/** /api/v1/file/:uuid/download */
export interface DownloadQuery {
  password?: string;
}

/** generic error response */
export interface ErrorResponse {
  error: string;
  code: string;
}
