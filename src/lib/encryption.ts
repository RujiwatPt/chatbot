import crypto from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM

async function getAppMasterSecret(): Promise<string> {
  let secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    try {
      const { env } = await getCloudflareContext();
      secret = (env as unknown as Record<string, string | undefined>)
        .ENCRYPTION_SECRET;
    } catch {
      // outside Cloudflare context
    }
  }

  if (!secret || secret.trim().length < 16) {
    throw new Error(
      "SECURITY ERROR: ENCRYPTION_SECRET environment variable must be set in Cloudflare Worker settings (at least 16 characters).",
    );
  }

  return secret.trim();
}

// Module-level per-instance cache: Intentionally per-instance in serverless environments
// (32 bytes per distinct active user) to eliminate CPU overhead from repeated HKDF derivations.
const MAX_USER_KEY_CACHE_SIZE = 500;
const userKeyCache = new Map<string, Buffer>();

/**
 * Derives a unique 32-byte (256-bit) AES key for a specific user using HKDF.
 * Results are cached per user ID to eliminate CPU overhead during bulk message decryption.
 */
async function deriveUserKey(userId: string): Promise<Buffer> {
  const cached = userKeyCache.get(userId);
  if (cached) return cached;

  if (userKeyCache.size >= MAX_USER_KEY_CACHE_SIZE) {
    userKeyCache.clear();
  }

  const masterSecret = await getAppMasterSecret();
  const key = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      masterSecret,
      userId,
      "user-chat-message-encryption-v1",
      32,
    ),
  );
  userKeyCache.set(userId, key);
  return key;
}

/**
 * Encrypts plaintext message using AES-256-GCM with per-user HKDF key derivation.
 */
export async function encryptText(
  plaintext: string,
  userId: string,
): Promise<string> {
  if (!plaintext || typeof plaintext !== "string") {
    return plaintext;
  }

  // Prepend zero-width space to escape user messages starting literally with PREFIX to prevent collisions
  const safePlaintext = plaintext.startsWith(PREFIX) ? `\u200B${plaintext}` : plaintext;

  const key = await deriveUserKey(userId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(safePlaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag().toString("hex");

  return `${PREFIX}${iv.toString("hex")}:${tag}:${encrypted}`;
}

/**
 * Decrypts authenticated ciphertext payload.
 * Supports backward compatibility by returning legacy unencrypted text as-is.
 */
export async function decryptText(
  ciphertext: string,
  userId: string,
): Promise<string> {
  if (
    !ciphertext ||
    typeof ciphertext !== "string" ||
    !ciphertext.startsWith(PREFIX)
  ) {
    return ciphertext;
  }

  try {
    const payload = ciphertext.slice(PREFIX.length);
    const parts = payload.split(":");
    if (parts.length !== 3) {
      return ciphertext;
    }

    const [ivHex, tagHex, encryptedHex] = parts;
    const key = await deriveUserKey(userId);
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    // Remove zero-width space escape prefix if present
    if (decrypted.startsWith(`\u200B${PREFIX}`)) {
      return decrypted.slice(1);
    }

    return decrypted;
  } catch (err) {
    console.error("[decryption_failure] Key rotation mismatch or corrupt ciphertext for user:", userId, err);
    return "[Encrypted Message]";
  }
}
