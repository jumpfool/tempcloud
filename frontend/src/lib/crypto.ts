const IV_LENGTH = 12;

export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKeyToString(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return btoa(JSON.stringify(jwk));
}

export async function importKeyFromString(encoded: string): Promise<CryptoKey> {
  const jwk = JSON.parse(atob(encoded));
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

export async function encryptFile(file: File, key: CryptoKey): Promise<Blob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = await file.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );
  return new Blob([iv, ciphertext]);
}

export async function decryptBlob(blob: Blob, key: CryptoKey): Promise<Blob> {
  const buffer = await blob.arrayBuffer();
  const iv = buffer.slice(0, IV_LENGTH);
  const ciphertext = buffer.slice(IV_LENGTH);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    ciphertext
  );
  return new Blob([plaintext]);
}
