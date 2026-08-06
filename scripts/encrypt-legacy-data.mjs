import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const { Client } = pg;

// Load .env file variables manually
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("Missing SUPABASE_DB_URL in .env");
  process.exit(1);
}

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getAppMasterSecret() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    console.error(
      "❌ FATAL: ENCRYPTION_SECRET is missing or under 16 characters in environment. Refusing to run encryption migration with a default or insecure key.",
    );
    process.exit(1);
  }
  return secret;
}

function deriveUserKey(userId) {
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

function encryptText(plaintext, userId) {
  if (!plaintext || typeof plaintext !== "string" || plaintext.startsWith(PREFIX)) {
    return plaintext;
  }
  try {
    const key = deriveUserKey(userId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");
    return `${PREFIX}${iv.toString("hex")}:${tag}:${encrypted}`;
  } catch (err) {
    console.error("Encryption error:", err);
    return plaintext;
  }
}

async function migrate() {
  console.log("🔒 Starting Direct PostgreSQL Legacy Encryption Migration...");

  const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false";
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized },
  });
  await client.connect();

  try {
    // 1. Encrypt unencrypted messages
    const { rows: messages } = await client.query(
      `SELECT m.id, m.content, c.user_id 
       FROM messages m 
       JOIN chats c ON m.chat_id = c.id 
       WHERE m.content NOT LIKE 'enc:v1:%'`,
    );

    console.log(`Found ${messages.length} unencrypted message rows.`);
    let msgEncrypted = 0;
    for (const msg of messages) {
      const encrypted = encryptText(msg.content, msg.user_id);
      await client.query("UPDATE messages SET content = $1 WHERE id = $2", [
        encrypted,
        msg.id,
      ]);
      msgEncrypted++;
    }

    // 2. Encrypt unencrypted memories
    const { rows: memories } = await client.query(
      `SELECT m.id, m.content, c.user_id 
       FROM memories m 
       JOIN chats c ON m.chat_id = c.id 
       WHERE m.content NOT LIKE 'enc:v1:%'`,
    );

    console.log(`Found ${memories.length} unencrypted memory rows.`);
    let memEncrypted = 0;
    for (const mem of memories) {
      const encrypted = encryptText(mem.content, mem.user_id);
      await client.query("UPDATE memories SET content = $1 WHERE id = $2", [
        encrypted,
        mem.id,
      ]);
      memEncrypted++;
    }

    console.log("✅ Retroactive Encryption Complete!");
    console.log(`- Total Messages Encrypted: ${msgEncrypted}`);
    console.log(`- Total Memories Encrypted: ${memEncrypted}`);
  } finally {
    await client.end();
  }
}

migrate().catch(console.error);
