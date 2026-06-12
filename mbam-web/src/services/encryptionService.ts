import type { EncryptedValue, WrappedDataKey } from "../types/offline.types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PBKDF2_ITERATIONS = 310_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

async function deriveWrappingKey(
  passphrase: string,
  salt: ArrayBuffer,
  iterations: number,
): Promise<CryptoKey> {
  if (passphrase.length < 10) {
    throw new Error("offline_passphrase_too_short");
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createWrappedDataKey(
  passphrase: string,
): Promise<{ key: CryptoKey; wrappedKey: WrappedDataKey }> {
  const rawDataKey = crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(
    passphrase,
    salt.buffer,
    PBKDF2_ITERATIONS,
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    rawDataKey,
  );
  const key = await crypto.subtle.importKey(
    "raw",
    rawDataKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  rawDataKey.fill(0);

  return {
    key,
    wrappedKey: {
      version: 1,
      algorithm: "AES-GCM",
      derivation: "PBKDF2-SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    },
  };
}

export async function unwrapDataKey(
  passphrase: string,
  wrappedKey: WrappedDataKey,
): Promise<CryptoKey> {
  const wrappingKey = await deriveWrappingKey(
    passphrase,
    base64ToBuffer(wrappedKey.salt),
    wrappedKey.iterations,
  );
  const rawDataKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuffer(wrappedKey.iv) },
    wrappingKey,
    base64ToBuffer(wrappedKey.ciphertext),
  );

  return crypto.subtle.importKey(
    "raw",
    rawDataKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson<T>(
  key: CryptoKey,
  value: T,
  associatedData: string,
): Promise<EncryptedValue> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(associatedData),
    },
    key,
    encoder.encode(JSON.stringify(value)),
  );

  return {
    version: 1,
    algorithm: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson<T>(
  key: CryptoKey,
  value: EncryptedValue,
  associatedData: string,
): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBuffer(value.iv),
      additionalData: encoder.encode(associatedData),
    },
    key,
    base64ToBuffer(value.ciphertext),
  );

  return JSON.parse(decoder.decode(plaintext)) as T;
}

export function decodeBase64(value: string): ArrayBuffer {
  return base64ToBuffer(value);
}
