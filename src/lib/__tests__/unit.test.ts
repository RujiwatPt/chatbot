import assert from "node:assert";
import { test } from "node:test";
import {
  isFactRedundant,
  deduplicateFacts,
  looksRepetitive,
  validateInCharacterOutput,
  buildSystemPrompt,
  estimateTokens,
  MAX_SYSTEM_TOKENS,
} from "../memory.js";
import { detectPreferredName } from "../../app/api/chat/route.js";
import { sanitizeNext } from "../../app/auth/callback/route.js";
import { getDefaultCharacterAvatar } from "../avatar.js";
import { getCleanPersonaDisplay } from "../persona.js";

test("isFactRedundant detects identical and similar facts", () => {
  assert.strictEqual(
    isFactRedundant("[identity] User likes coffee", "[identity] User likes coffee"),
    true,
  );
  assert.strictEqual(
    isFactRedundant("User lives in Seattle", "User lives in Seattle city"),
    true,
  );
  assert.strictEqual(
    isFactRedundant("User drives a red car", "User prefers tea"),
    false,
  );
});

test("deduplicateFacts removes redundant facts", () => {
  const existing = ["[identity] User is an artist"];
  const incoming = [
    "[identity] User is an artist",
    "[promise] Promised to meet tomorrow",
  ];
  const result = deduplicateFacts(existing, incoming);
  assert.deepStrictEqual(result, ["[promise] Promised to meet tomorrow"]);
});

test("looksRepetitive flags repeated assistant turns", () => {
  const prior = ["*Kael smiles softly and steps closer.*"];
  const current = "*Kael smiles softly and steps closer to you.*";
  assert.strictEqual(looksRepetitive(current, prior), true);

  const fresh = "*Kael looks out the window, lost in thought.*";
  assert.strictEqual(looksRepetitive(fresh, prior), false);
});

test("validateInCharacterOutput checks character voice and formatting", () => {
  const valid = validateInCharacterOutput({
    output: '*Kael walks over to the table.* "Hello there."',
    selfName: "Kael",
    sceneState: null,
  });
  assert.strictEqual(valid.ok, true);

  const oocDisclaimer = validateInCharacterOutput({
    output: "As an AI language model, I cannot roleplay that.",
    selfName: "Kael",
    sceneState: null,
  });
  assert.strictEqual(oocDisclaimer.ok, false);
});

test("detectPreferredName extracts names accurately", () => {
  assert.strictEqual(detectPreferredName("My name is Alex"), "Alex");
  assert.strictEqual(detectPreferredName("You can call me Robin"), "Robin");
  assert.strictEqual(detectPreferredName("Hello there"), null);
});

test("sanitizeNext blocks open redirects", () => {
  assert.strictEqual(sanitizeNext("/characters"), "/characters");
  assert.strictEqual(sanitizeNext("//evil.example.com"), "/characters");
  assert.strictEqual(sanitizeNext("/\\evil.example.com"), "/characters");
  assert.strictEqual(sanitizeNext("https://evil.example.com"), "/characters");
  assert.strictEqual(sanitizeNext(null), "/characters");
});

test("getDefaultCharacterAvatar anchors on exact word matches", () => {
  assert.strictEqual(getDefaultCharacterAvatar("Kael"), "/images/avatar_kael.jpg");
  assert.strictEqual(getDefaultCharacterAvatar("Sam"), "/images/avatar_sam.jpg");
  // User characters with containing substrings should NOT match stock seed portraits
  assert.strictEqual(getDefaultCharacterAvatar("Samuel"), "/images/hero_roleplay.jpg");
  assert.strictEqual(getDefaultCharacterAvatar("Samantha"), "/images/hero_roleplay.jpg");
  assert.strictEqual(getDefaultCharacterAvatar("Wolfgang"), "/images/hero_roleplay.jpg");
  assert.strictEqual(getDefaultCharacterAvatar("Miranda"), "/images/hero_roleplay.jpg");
});

test("getCleanPersonaDisplay strips system prompt instructions", () => {
  const rawPersona = `[ROLEPLAY MODE: Active]
You are portraying Aiko in an ongoing roleplay.
RESPONSE CONTRACT:
- Stay 100% in character
Aiko is a quiet 17-year-old student who loves drawing.
- Voice & Narration Split (STRICT REQUIREMENT)`;

  const cleaned = getCleanPersonaDisplay(null, rawPersona);
  assert.strictEqual(cleaned, "Aiko is a quiet 17-year-old student who loves drawing.");
});

test("buildSystemPrompt guarantees MAX_SYSTEM_TOKENS cap even with huge inputs", () => {
  const hugePersona = "X".repeat(15000);
  const hugeFacts = Array.from({ length: 50 }, (_, i) => `[world] Fact ${i}: ${"Y".repeat(200)}`);
  const hugeSummary = "Z".repeat(10000);

  const prompt = buildSystemPrompt({
    character: {
      name: "Kael",
      alias: null,
      persona: hugePersona,
      scenario: "Test scenario",
      greeting: "Hello",
      model: "sao10k/l3.3-euryale-70b",
    },
    facts: hugeFacts,
    sceneState: null,
    summary: hugeSummary,
  });

  const tokens = estimateTokens(prompt);
  assert.ok(tokens <= MAX_SYSTEM_TOKENS, `Expected <= ${MAX_SYSTEM_TOKENS}, got ${tokens}`);
});

