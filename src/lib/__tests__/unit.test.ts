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
  cleanRoleplayTropes,
  extractUsedActionsAndSounds,
  extractRepeatedPhrases,
  extractLastTurnPhrases,
} from "../memory.js";
import { detectPreferredName } from "../../app/api/chat/route.js";
import { sanitizeNext } from "../../app/auth/callback/route.js";
import { getDefaultCharacterAvatar } from "../avatar.js";
import { getCleanPersonaDisplay } from "../persona.js";
import { sanitizeModel, DEFAULT_MODEL, SUMMARIZER_MODEL } from "../openrouter.js";
import { isAdminUser } from "../auth-admin.js";

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

  const puppeteer = validateInCharacterOutput({
    output: '*Kael watches as you gasp and shiver.* "Easy."',
    selfName: "Kael",
    sceneState: null,
  });
  assert.ok(puppeteer.reasons.includes("user_puppeting"));

  const fillerSpam = validateInCharacterOutput({
    output: '*Kael steps closer softly.* "I moved quietly, then slowly, then softly again."',
    selfName: "Kael",
    sceneState: null,
  });
  assert.ok(fillerSpam.reasons.includes("filler_adverb_spam"));

  const notAliasConfusion = validateInCharacterOutput({
    output: '*Kael sets the cup down.* "You are quiet tonight."',
    selfName: "Kael",
    sceneState: null,
  });
  assert.strictEqual(notAliasConfusion.reasons.includes("alias_as_user_name"), false);
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
  assert.ok(romanticPrompt.includes("Greeting Anchor / Voice Reference"));
  assert.ok(romanticPrompt.includes('*smiles* "Welcome back."\n'));

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

test("buildSystemPrompt includes visual reference note and consistent pattern directives", () => {
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
  assert.ok(prompt.includes("OUTPUT RULES"));
  assert.ok(prompt.includes("Wording Variety:"));
  assert.ok(prompt.includes("[FINAL REMINDER]: Respond strictly in pattern"));
  assert.ok(prompt.includes("Play only Silas"));
});

test("cleanRoleplayTropes preserves creative actions, physical movements, and vocal delivery", () => {
  const cases = [
    {
      input: '*He chuckles softly as he walks over to the desk.* "Here is the file."',
      expected: '*He chuckles softly as he walks over to the desk.* "Here is the file."',
    },
    {
      input: '*He tilts his head to the side, studying your reaction.* "Are you sure?"',
      expected: '*He tilts his head to the side, studying your reaction.* "Are you sure?"',
    },
    {
      input: '*Dante sighs softly, crossing his arms over his chest.* "I didn\'t expect that."',
      expected: '*Dante sighs softly, crossing his arms over his chest.* "I didn\'t expect that."',
    },
    {
      input: '*He leans against the counter, smiling.* "Whatever you say."',
      expected: '*He leans against the counter, smiling.* "Whatever you say."',
    },
    {
      input: '*He opens the drawer and takes out a silver key.* "Take this."',
      expected: '*He opens the drawer and takes out a silver key.* "Take this."',
    },
    {
      input: '*Running a hand through his hair, he turns to you.* "I forgot the password."',
      expected: '*Running a hand through his hair, he turns to you.* "I forgot the password."',
    },
    {
      input: '*Clearing his throat, he taps the microphone.* "Testing, one two."',
      expected: '*Clearing his throat, he taps the microphone.* "Testing, one two."',
    },
    {
      input: '*He rubs the back of his neck, looking down.* "My mistake."',
      expected: '*He rubs the back of his neck, looking down.* "My mistake."',
    },
  ];

  for (const { input, expected } of cases) {
    assert.strictEqual(cleanRoleplayTropes(input), expected);
  }
});

test("extractUsedActionsAndSounds detects used tics across turns", () => {
  const turns = [
    '*He chuckles softly and leans against the wall.* "Hello."',
    '*Shifting his weight, his breath hitches.* "What is it?"',
  ];
  const used = extractUsedActionsAndSounds(turns);
  assert.ok(used.includes("chuckle/chuckling"));
  assert.ok(used.includes("leaning"));
  assert.ok(used.includes("shifting weight"));
  assert.ok(used.includes("breath hitching"));
  assert.strictEqual(used.includes("head tilting"), false);
});

test("buildSystemPrompt guides structural variety across turns without negative blacklists", () => {
  const prompt = buildSystemPrompt({
    character: {
      name: "Silas",
      alias: null,
      persona: "A brooding companion.",
      scenario: null,
      greeting: "Hello.",
      model: "sao10k/l3.3-euryale-70b",
      tags: [],
    },
    facts: [],
    sceneState: null,
    summary: null,
    priorAssistant: [
      '*Silas chuckles softly, tilting his head.* "I see."',
      '*He sighs and leans against the counter.* "Go on."',
    ],
  });

  assert.ok(prompt.includes("Do not reuse this turn:"));
  assert.ok(prompt.includes("Recent turn openings:"));
  assert.ok(prompt.includes("Vary how you open this response"));
  assert.ok(prompt.includes("Physical/vocal beats already used in recent turns:"));
  assert.ok(prompt.includes("chuckle/chuckling"));
  assert.ok(prompt.includes("leaning"));
});

test("extractRepeatedPhrases identifies multi-word n-grams repeated across turns", () => {
  const turns = [
    '*His warm breath tickles your ear as he leans in close.* "I know."',
    '*He smiles, his warm breath tickling your ear softly.* "Are you ready?"',
  ];
  const repeated = extractRepeatedPhrases(turns);
  assert.ok(repeated.includes("his warm breath"));
  assert.ok(repeated.includes("your ear"));
});

test("buildSystemPrompt explicitly injects RECENTLY REPEATED PHRASES when detected", () => {
  const prompt = buildSystemPrompt({
    character: {
      name: "Silas",
      alias: null,
      persona: "A companion.",
      scenario: null,
      greeting: "Hello.",
      model: "sao10k/l3.3-euryale-70b",
      tags: [],
    },
    facts: [],
    sceneState: null,
    summary: null,
    priorAssistant: [
      '*His warm breath tickles your ear as he leans in.* "Hello."',
      '*He smiles gently, his warm breath tickling your ear.* "Stay."',
    ],
  });

  assert.ok(prompt.includes("RECENTLY REPEATED PHRASES (STRICTLY AVOID):"));
  assert.ok(prompt.includes("his warm breath"));
});

test("extractLastTurnPhrases pulls distinctive n-grams from a single reply", () => {
  const phrases = extractLastTurnPhrases(
    '*His warm breath tickles your ear as he leans in close.* "I know."',
  );
  assert.ok(phrases.some((p) => p.includes("warm breath")));
  assert.ok(phrases.every((p) => p.split(" ").length >= 3));
});

test("buildSystemPrompt injects last-reply phrases even when they have not been repeated yet", () => {
  const prompt = buildSystemPrompt({
    character: {
      name: "Silas",
      alias: null,
      persona: "A companion.",
      scenario: null,
      greeting: "Hello.",
      model: "sao10k/l3.3-euryale-70b",
      tags: [],
    },
    facts: [],
    sceneState: null,
    summary: null,
    priorAssistant: [
      '*His warm breath tickles your ear as he leans in close.* "Stay with me."',
    ],
  });

  assert.ok(prompt.includes("Phrases from your last reply"));
  assert.ok(prompt.includes("warm breath"));
});

test("sanitizeModel allows SUMMARIZER_MODEL internally without falling back to DEFAULT_MODEL", () => {
  // When allowInternal is true (internal services like summarizer):
  assert.strictEqual(sanitizeModel(SUMMARIZER_MODEL, true), "meta-llama/llama-3.3-70b-instruct");
  // When allowInternal is false (public user form input):
  assert.strictEqual(sanitizeModel(SUMMARIZER_MODEL, false), DEFAULT_MODEL);
  // Allowed public models:
  assert.strictEqual(sanitizeModel("sao10k/l3.3-euryale-70b"), "sao10k/l3.3-euryale-70b");
  // Arbitrary invalid models fall back to DEFAULT_MODEL:
  assert.strictEqual(sanitizeModel("invalid/random-model"), DEFAULT_MODEL);
});

test("isAdminUser verifies admin email against ADMIN_EMAILS", () => {
  const originalEnv = process.env.ADMIN_EMAILS;
  try {
    process.env.ADMIN_EMAILS = "admin@example.com, owner@howly.ai ";
    assert.strictEqual(isAdminUser("admin@example.com"), true);
    assert.strictEqual(isAdminUser("ADMIN@EXAMPLE.COM"), true);
    assert.strictEqual(isAdminUser("owner@howly.ai"), true);
    assert.strictEqual(isAdminUser("user@example.com"), false);
    assert.strictEqual(isAdminUser(null), false);
    assert.strictEqual(isAdminUser(undefined), false);
    assert.strictEqual(isAdminUser(""), false);
  } finally {
    process.env.ADMIN_EMAILS = originalEnv;
  }
});


