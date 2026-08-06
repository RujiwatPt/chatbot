import assert from "node:assert";
import { test } from "node:test";
import {
  isFactRedundant,
  deduplicateFacts,
  looksRepetitive,
  validateInCharacterOutput,
} from "../memory.js";
import { detectPreferredName } from "../../app/api/chat/route.js";
import { sanitizeNext } from "../../app/auth/callback/route.js";

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
