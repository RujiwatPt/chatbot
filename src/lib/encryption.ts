import crypto from "node:crypto";

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM

import { getCloudflareContext } from "@opennextjs/cloudflare";

function getAppMasterSecret(): string {
  let secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    try {
      const { env } = getCloudflareContext();
      secret = (env as unknown as Record<string, string | undefined>).ENCRYPTION_SECRET;
    } catch {
      // outside Cloudflare context
    }
  }
  if (secret && secret.length >= 16) {
    return secret;
  }
  // Stable fallback for local dev environments if ENCRYPTION_SECRET is omitted
  return "fallback-dev-roleplay-chatbot-secret-key-32b";
}

/**
 * Derives a unique 32-byte (256-bit) AES key for a specific user using HKDF.
 */
function deriveUserKey(userId: string): Buffer {
  const masterSecret = getAppMasterSecret();
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      masterSecret,
      userId,
      "user-chat-message-encryption-v1",
      32,
    ),
  );
}

/**
 * Encrypts a plaintext string using AES-256-GCM with a per-user key.
 * Output format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encryptText(plaintext: string, userId: string): string {
  if (!plaintext) return plaintext;
  try {
    const key = deriveUserKey(userId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");

    return `${PREFIX}${iv.toString("hex")}:${tag}:${encrypted}`;
  } catch (err) {
    console.error("[encryption] Failed to encrypt text:", err);
    return plaintext;
  }
}

/**
 * Decrypts an AES-256-GCM ciphertext string with a per-user key.
 * Falls back gracefully to plaintext for legacy unencrypted messages.
 */
export function decryptText(ciphertext: string, userId: string): string {
  if (!ciphertext || typeof ciphertext !== "string") return ciphertext;
  if (!ciphertext.startsWith(PREFIX)) {
    // Legacy unencrypted message
    return ciphertext;
  }

  try {
    const key = deriveUserKey(userId);
    const payload = ciphertext.slice(PREFIX.length);
    const parts = payload.split(":");
    if (parts.length !== 3) {
      return ciphertext;
    }

    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (err) {
    console.error("[encryption] Failed to decrypt text:", err);
    // If key fails or payload corrupted, return original string safely
    return ciphertext;
  }
}
