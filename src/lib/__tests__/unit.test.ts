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
  stripAppearanceTropes,
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

test("detectPreferredName extracts names accurately and resists false positives", () => {
  assert.strictEqual(detectPreferredName("My name is Alex"), "Alex");
  assert.strictEqual(detectPreferredName("You can call me Robin"), "Robin");
  assert.strictEqual(detectPreferredName("I go by Jin"), "Jin");
  assert.strictEqual(detectPreferredName("Hello there"), null);

  // False positive resistance
  assert.strictEqual(detectPreferredName("Don't call me crazy"), null);
  assert.strictEqual(detectPreferredName("Never call me darling"), null);
  assert.strictEqual(detectPreferredName("Stop calling me baby"), null);
  assert.strictEqual(detectPreferredName("Call me when you get home"), null);
  assert.strictEqual(detectPreferredName("You can call me tonight"), null);
  assert.strictEqual(detectPreferredName("Call me later"), null);
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

test("buildSystemPrompt conditions intimate directives on character tags", () => {
  const romanticChar = {
    name: "Kael",
    alias: null,
    persona: "A caring wolfman companion.",
    scenario: null,
    greeting: '*smiles* "Welcome back."',
    model: "sao10k/l3.3-euryale-70b",
    tags: ["Romance", "NSFW"],
  };

  const romanticPrompt = buildSystemPrompt({
    character: romanticChar,
    facts: [],
    sceneState: null,
    summary: null,
  });

  assert.ok(romanticPrompt.includes("Intimate & Sensual Scenes"));
  assert.ok(romanticPrompt.includes("Replace Appearance Commentary with Action & Environment"));
  // Greeting anchor should NOT be wrapped in redundant outer asterisks
  assert.ok(romanticPrompt.includes("Greeting Anchor / Voice Reference:\n*smiles* \"Welcome back.\"\n"));

  const therapistChar = {
    name: "Dr. Mira Vance",
    alias: null,
    persona: "A licensed therapist practicing person-centered CBT.",
    scenario: "First session in office.",
    greeting: '*welcomes you* "What brings you in today?"',
    model: "sao10k/l3.3-euryale-70b",
    tags: ["Support", "Cozy"],
  };

  const therapistPrompt = buildSystemPrompt({
    character: therapistChar,
    facts: [],
    sceneState: null,
    summary: null,
  });

  assert.strictEqual(therapistPrompt.includes("Intimate & Sensual Scenes"), false);
  assert.ok(therapistPrompt.includes("Interpersonal Connection & Emotional Resonance"));
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

test("stripAppearanceTropes eliminates gaze clichés, fangs, and smirks while preserving actions and dialogue", () => {
  const cases = [
    {
      input: '*His golden eyes soften as he steps closer.* "Hello."',
      expected: '*He steps closer.* "Hello."',
    },
    {
      input: '*His amber gaze darkens, sharp fangs catching the light.* "Are you ready?"',
      expected: '"Are you ready?"',
    },
    {
      input: '*He steps into the room, his piercing blue eyes scanning the shelves.* "Nice place."',
      expected: '*He steps into the room, scanning the shelves.* "Nice place."',
    },
    {
      input: '*His golden eyes soften.* "I understand."',
      expected: '"I understand."',
    },
    {
      input: '*A smirk tugs at his lips as he pours the tea.* "Drink up."',
      expected: '*He pours the tea.* "Drink up."',
    },
    {
      input: '*He looks over at you with a quiet smile.* "Welcome back."',
      expected: '*He looks over at you with a quiet smile.* "Welcome back."',
    },
    {
      input: '*Wolf ears twitch atop his head as his tail sways.* "Did you hear that?"',
      expected: '"Did you hear that?"',
    },
  ];

  for (const { input, expected } of cases) {
    assert.strictEqual(stripAppearanceTropes(input), expected);
  }
});

test("buildSystemPrompt includes visual reference note and final zero-appearance reminder", () => {
  const prompt = buildSystemPrompt({
    character: {
      name: "Silas",
      alias: null,
      persona: "A brooding vampire with silver eyes and fangs.",
      scenario: "In a tavern.",
      greeting: '*glances over* "Evening."',
      model: "sao10k/l3.3-euryale-70b",
      tags: ["Fantasy"],
    },
    facts: [],
    sceneState: null,
    summary: null,
  });

  assert.ok(prompt.includes("Visual Reference Note: Physical details in this definition are static visual facts"));
  assert.ok(prompt.includes("[FINAL REMINDER — ZERO APPEARANCE COMMENTARY]: Do NOT narrate or describe Silas's eyes, gaze, teeth, or physical body."));
  assert.ok(prompt.includes("ZERO SELF-APPEARANCE COMMENTARY"));
});


