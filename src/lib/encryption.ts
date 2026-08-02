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

/**
 * Derives a unique 32-byte (256-bit) AES key for a specific user using HKDF.
 */
async function deriveUserKey(userId: string): Promise<Buffer> {
  const masterSecret = await getAppMasterSecret();
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
 * Encrypts plaintext message using AES-256-GCM with per-user HKDF key derivation.
 */
export async function encryptText(
  plaintext: string,
  userId: string,
): Promise<string> {
  if (
    !plaintext ||
    typeof plaintext !== "string" ||
    plaintext.startsWith(PREFIX)
  ) {
    return plaintext;
  }

  const key = await deriveUserKey(userId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
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

    return decrypted;
  } catch (err) {
    console.error("[encryption_decrypt_error] Failed to decrypt message:", err);
    return "[Encrypted Message]";
  }
}
