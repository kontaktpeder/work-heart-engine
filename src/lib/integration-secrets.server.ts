// Server-only: symmetric encryption for org integration secrets.
// Uses AES-GCM with a key derived from INTEGRATION_SECRETS_KEY via SHA-256.

const IV_BYTES = 12;

function getEnvKey(): string {
  const k = process.env.INTEGRATION_SECRETS_KEY;
  if (!k || k.length < 16) {
    throw new Error("INTEGRATION_SECRETS_KEY is not set");
  }
  return k;
}

async function getCryptoKey(): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(getEnvKey());
  const hashed = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hashed, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv, 0);
  combined.set(ct, iv.length);
  return `v1:${toB64(combined)}`;
}

export async function decryptSecret(ciphertext: string): Promise<string> {
  if (!ciphertext.startsWith("v1:")) {
    throw new Error("Unsupported ciphertext version");
  }
  const key = await getCryptoKey();
  const combined = fromB64(ciphertext.slice(3));
  const iv = combined.slice(0, IV_BYTES);
  const ct = combined.slice(IV_BYTES);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
