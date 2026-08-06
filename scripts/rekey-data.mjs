import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;

function loadEnvFile(file) {
  const envPath = path.join(process.cwd(), file);
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key] || key === "ENCRYPTION_SECRET") {
          process.env[key] = val;
        }
      }
    }
  }
}

// Load .env then .env.local
loadEnvFile(".env");
loadEnvFile(".env.local");

const dbUrl = process.env.SUPABASE_DB_URL;
const oldSecret = process.argv[2];
const newSecret = process.argv[3] || process.env.ENCRYPTION_SECRET;

if (!dbUrl) {
  console.error("Missing SUPABASE_DB_URL in .env / .env.local");
  process.exit(1);
}

if (!oldSecret || oldSecret.length < 16) {
  console.error(
    "❌ FATAL: Please provide a valid OLD ENCRYPTION_SECRET (at least 16 chars). Usage: node scripts/rekey-data.mjs <OLD_SECRET> <NEW_SECRET>",
  );
  process.exit(1);
}

if (!newSecret || newSecret.length < 16) {
  console.error(
    "❌ FATAL: Please provide a valid NEW ENCRYPTION_SECRET (at least 16 chars). Usage: node scripts/rekey-data.mjs <OLD_SECRET> <NEW_SECRET>",
  );
  process.exit(1);
}

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(masterSecret, userId) {
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

function decryptTextWithKey(ciphertext, userId, secretKey) {
  if (!ciphertext || !ciphertext.startsWith(PREFIX)) return ciphertext;
  try {
    const payload = ciphertext.slice(PREFIX.length);
    const parts = payload.split(":");
    if (parts.length !== 3) return ciphertext;
    const [ivHex, tagHex, encryptedHex] = parts;
    const key = deriveKey(secretKey, userId);
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Failed to decrypt row:", err);
    return null;
  }
}

function encryptTextWithKey(plaintext, userId, secretKey) {
  if (!plaintext) return plaintext;
  const key = deriveKey(secretKey, userId);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${PREFIX}${iv.toString("hex")}:${tag}:${encrypted}`;
}

async function rekey() {
  console.log("🔑 Re-keying Database Messages & Memories...");
  console.log(`- Old Secret: ${oldSecret.slice(0, 6)}...`);
  console.log(`- New Secret: ${newSecret.slice(0, 6)}...`);

  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false";
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized },
  });
  await client.connect();

  try {
    const { rows: messages } = await client.query(
      `SELECT m.id, m.content, c.user_id 
       FROM messages m 
       JOIN chats c ON m.chat_id = c.id`,
    );

    let rekeyedMsg = 0;
    for (const msg of messages) {
      if (msg.content.startsWith(PREFIX)) {
        const decrypted = decryptTextWithKey(msg.content, msg.user_id, oldSecret);
        if (decrypted) {
          const newEncrypted = encryptTextWithKey(decrypted, msg.user_id, newSecret);
          await client.query("UPDATE messages SET content = $1 WHERE id = $2", [
            newEncrypted,
            msg.id,
          ]);
          rekeyedMsg++;
        }
      }
    }

    const { rows: memories } = await client.query(
      `SELECT m.id, m.content, c.user_id 
       FROM memories m 
       JOIN chats c ON m.chat_id = c.id`,
    );

    let rekeyedMem = 0;
    for (const mem of memories) {
      if (mem.content.startsWith(PREFIX)) {
        const decrypted = decryptTextWithKey(mem.content, mem.user_id, oldSecret);
        if (decrypted) {
          const newEncrypted = encryptTextWithKey(decrypted, mem.user_id, newSecret);
          await client.query("UPDATE memories SET content = $1 WHERE id = $2", [
            newEncrypted,
            mem.id,
          ]);
          rekeyedMem++;
        }
      }
    }

    console.log("✅ Re-key Complete!");
    console.log(`- Messages Re-keyed: ${rekeyedMsg}`);
    console.log(`- Memories Re-keyed: ${rekeyedMem}`);
  } finally {
    await client.end();
  }
}

rekey().catch(console.error);
