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
  extractLastTurnRemix,
} from "../memory.js";
import { detectPreferredName } from "../../app/api/chat/route.js";
import { sanitizeNext } from "../../app/auth/callback/route.js";
import { getDefaultCharacterAvatar } from "../avatar.js";
import { getCleanPersonaDisplay } from "../persona.js";
import { sanitizeModel, DEFAULT_MODEL, SUMMARIZER_MODEL } from "../openrouter.js";

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

test("looksRepetitive flags synonym remixes of the last reply", () => {
  const prior = ['*Kael chuckles softly and leans in.* "I know."'];
  const remix = '*Kael chuckles quietly and leans a little closer.* "I know."';
  assert.strictEqual(looksRepetitive(remix, prior), true);

  const laughSwap = '*Kael laughs gently and leans closer.* "I know."';
  assert.strictEqual(looksRepetitive(laughSwap, prior), true);

  const fresh = '*Kael looks out the window, lost in thought.* "Anyway."';
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

  assert.ok(romanticPrompt.includes("Intimate & Romantic Scenes"));
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

  assert.strictEqual(therapistPrompt.includes("Intimate & Romantic Scenes"), false);
  assert.ok(therapistPrompt.includes("Tone: Stay grounded"));
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

test("cleanRoleplayTropes preserves generated text cleanly", () => {
  const text = '  *He steps closer.* "Hello."  ';
  assert.strictEqual(stripAppearanceTropes(text), '*He steps closer.* "Hello."');
});

test("buildSystemPrompt includes clean pattern directives and subtext guidance without negative word reinforcement", () => {
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
    priorAssistant: [
      '*Silas chuckles softly, tilting his head.* "I see."',
      '*He sighs and leans against the counter.* "Go on."',
    ],
  });

  assert.ok(prompt.includes("ROLEPLAY GUIDELINES"));
  assert.ok(prompt.includes("Dialogue & Subtext: Let spoken dialogue and physical actions convey emotion"));
  assert.ok(prompt.includes("Play only Silas"));
  assert.ok(prompt.includes("Never speak, act, decide, or feel for the user."));
  assert.ok(prompt.includes("Advance the scene forward"));
  
  // Verify negative word and body reinforcements are completely removed
  assert.strictEqual(prompt.includes("never narrate the user's body"), false);
  assert.strictEqual(prompt.includes("RECENTLY REPEATED PHRASES"), false);
  assert.strictEqual(prompt.includes("Do not reuse this turn:"), false);
  assert.strictEqual(prompt.includes("Retire these verbs"), false);
  assert.strictEqual(prompt.includes("Physical/vocal beats already used"), false);
  assert.strictEqual(prompt.includes("Phrases from your last reply"), false);
});

test("extractLastTurnRemix quotes the last reply and retires stemmed verbs", () => {
  const remix = extractLastTurnRemix(
    '*Kael chuckles softly and leans in.* "I know."',
  );
  assert.ok(remix.excerpt.includes("chuckles softly"));
  assert.ok(remix.verbs.includes("chuckle"));
  assert.ok(remix.verbs.includes("lean"));
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


