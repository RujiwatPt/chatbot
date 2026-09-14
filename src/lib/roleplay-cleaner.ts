export type SceneState = {
  location: string;
  tone: string;
  relationship: string;
  goal: string;
};

export function cleanRoleplayTropes(text: string): string {
  if (!text) return text;

  return text
    .replace(/\*([^*]+)\*/g, (_fullMatch, actionInner: string) => {
      let cleaned = actionInner;

      const eyeAdjectives =
        "(?:golden|amber|emerald|crimson|ruby|sapphire|yellow|hazel|blue|green|red|violet|piercing|heavy|intense|narrowed|dark|soft|warm|cold|sharp)";
      const eyeNouns = "(?:eyes?|gaze|orbs?)";
      const eyeVerbs =
        "(?:soften|softens|softening|darken|darkens|darkening|harden|hardens|narrow|narrows|narrowing|flicker|flickers|flickering|gleam|gleams|gleaming|widen|widens|burn|burns|burning|flash|flashes|flashing|locking|locked|bore|bores|boring)";

      // 1. Static Eye / Gaze appearance descriptions
      const r1 = new RegExp(
        `^(?:with\\s+)?(?:his|her|their|my|[A-Z][a-z]+'s)?\\s*(?:${eyeAdjectives}\\s*){1,2}${eyeNouns}\\s+${eyeVerbs}(?:,\\s*|\\s+(?:as|while)\\s+)`,
        "gi",
      );
      cleaned = cleaned.replace(r1, "");
      const r2 = new RegExp(
        `^(?:his|her|their|my|[A-Z][a-z]+'s)?\\s*(?:${eyeAdjectives}\\s*){1,2}${eyeNouns}\\s+${eyeVerbs}(?:\\s+with\\s+[a-z]+)?(?:[.,;]|\\s+and\\s+)?`,
        "gi",
      );
      cleaned = cleaned.replace(r2, "");
      const r3 = new RegExp(
        `(?:,\\s*|\\s+with\\s+)(?:his|her|their|my|[A-Z][a-z]+'s)?\\s*(?:${eyeAdjectives}\\s*){1,2}${eyeNouns}\\s*`,
        "gi",
      );
      cleaned = cleaned.replace(r3, (m) => (m.startsWith(",") ? ", " : " "));
      const r4 = new RegExp(
        `(?:,\\s*)?(?:his|her|their|my|[A-Z][a-z]+'s)?\\s*${eyeNouns}\\s+${eyeVerbs}(?:\\s+with\\s+[a-z]+)?`,
        "gi",
      );
      cleaned = cleaned.replace(r4, "");

      // 2. Fangs / teeth appearance tropes
      cleaned = cleaned.replace(
        /(?:,\s*|\b(?:as|with)\s+)?(?:his|her|their|my)?\s*(?:sharp|pointed|gleaming)?\s*(?:teeth|fangs?|canines?)\s+(?:flash|flashes|flashing|glint|glints|glinting|graze|grazes|grazing|sink|sinks|sinking|bare|bares|baring|peeking|catch|catches|catching|brushing|pressing)[^,.*]*/gi,
        "",
      );

      // 3. Smirk / grin tropes
      cleaned = cleaned.replace(
        /^(?:a\s+)?(?:faint|soft|slight|crooked|wry|dry|knowing|amused|cocky)?\s*(?:smirk|grin)\s+(?:plays?|playing|tugs?|tugging|curls?|curling|spreads?|spreading|ghosts?|ghosting|creeps?|creeping)\s+(?:on|across|at)\s+(?:his|her|their)?\s*(?:lips|mouth|face)(?:,\s*|\s+(?:as|while)\s+)?/gi,
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)(?:a\s+)?(?:faint|soft|slight|crooked|wry|dry|knowing|amused|cocky)?\s*(?:smirk|grin)\s+(?:plays?|playing|tugs?|tugging|curls?|curling|spreads?|spreading|ghosts?|ghosting|creeps?|creeping)\s+(?:on|across|at)\s+(?:his|her|their)?\s*(?:lips|mouth|face)[^,.*]*/gi,
        "",
      );

      // 4. Animal ears / tail tropes
      cleaned = cleaned.replace(
        /(?:^|,\s*)(?:his|her|their|my)?\s*(?:wolf|cat|fox|animal)?\s*(?:ears?\s+(?:twitch|twitches|twitching|pin|pins|flatten|flattens)|tail\s+(?:sways?|swaying|flicks?|flicking|lashes?|lashing))[^,.*]*/gi,
        "",
      );

      // Clean punctuation and whitespace
      cleaned = cleaned
        .replace(/^[\s,;.-]+|[\s,;.-]+$/g, "")
        .replace(/\s*,\s*,\s*/g, ", ")
        .replace(/,\s*and\s*$/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      // If cleaned is just a dangling pronoun like "He", "She", "They", etc.
      if (/^(?:he|she|they|[A-Z][a-z]+)\.?$/i.test(cleaned)) {
        return "";
      }

      if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        if (!/[.!?]$/.test(cleaned)) cleaned += ".";
        return `*${cleaned}*`;
      }
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const stripAppearanceTropes = cleanRoleplayTropes;

export function extractUsedActionsAndSounds(turns: string[]): string[] {
  const categories: Array<{ regex: RegExp; name: string }> = [
    { regex: /\b(?:chuckle[sd]?|chuckling)\b/i, name: "chuckle/chuckling" },
    { regex: /\b(?:sigh[sd]?|sighing)\b/i, name: "sigh/sighing" },
    { regex: /\b(?:groan[sd]?|groaning)\b/i, name: "groan/groaning" },
    { regex: /\b(?:whisper[sd]?|whispering)\b/i, name: "whisper/whispering" },
    { regex: /\b(?:growl[sd]?|growling|rumble[sd]?|rumbling)\b/i, name: "growl/rumble" },
    { regex: /\b(?:murmur[sd]?|murmuring|mutter[sd]?|muttering)\b/i, name: "murmur/mutter" },
    { regex: /\b(?:hum(?:s|med|ming)?)\b/i, name: "hum/humming" },
    { regex: /\b(?:gasp[sd]?|gasping)\b/i, name: "gasp/gasping" },
    { regex: /\b(?:snort[sd]?|snorting|grunt[sd]?|grunting)\b/i, name: "snort/grunt" },
    { regex: /\bbreath\s+(?:hitches?|hitching|catches?|catching|fanning)\b/i, name: "breath hitching" },
    { regex: /\b(?:tilt(?:s|ed|ing)?|cock(?:s|ed|ing)?)\s+(?:his|her|their)?\s*head\b/i, name: "head tilting" },
    { regex: /\b(?:smirk[sd]?|smirking)\b/i, name: "smirk/smirking" },
    { regex: /\b(?:bit(?:e|es|ing)|chew(?:s|ed|ing)?)\s+(?:his|her|their|a|the)?\s*lipp?s?\b/i, name: "biting lip" },
    { regex: /\b(?:swallow[sd]?|swallowing)\b/i, name: "swallowing" },
    { regex: /\b(?:look[sd]?|looking)\s+away\b/i, name: "looking away" },
    { regex: /\b(?:trace[sd]?|tracing|brush(?:es|ed|ing)?)\b/i, name: "tracing/brushing" },
    { regex: /\b(?:eyes?|gaze)\s+(?:soften|softens|softening|darken|darkens)\b/i, name: "eyes softening/darkening" },
    { regex: /\b(?:step[sd]?|stepping)\s+(?:closer|forward|back)\b/i, name: "stepping closer/away" },
    { regex: /\bclos(?:es|ed|ing)\s+(?:the\s+)?(?:distance|gap|space)\b/i, name: "closing distance" },
    { regex: /\blean(?:s|ed|ing)?\s+(?:in|closer|forward|against|back)\b/i, name: "leaning" },
    { regex: /\bshift(?:s|ed|ing)?\s+(?:his|her|their)?\s*weight\b/i, name: "shifting weight" },
    { regex: /\b(?:cross(?:es|ed|ing)?|fold(?:s|ed|ing)?)\s+(?:his|her|their)?\s*arms\b/i, name: "crossing arms" },
    { regex: /\b(?:arch(?:es|ed|ing)?|rais(?:es|ed|ing)?)\s+(?:an?|his|her|their)?\s*(?:eyebrow|brow)\b/i, name: "eyebrow raising" },
    { regex: /\b(?:run(?:s|ning)?|ran)\s+(?:a|his|her|their)\s+hand\s+through\s+(?:his|her|their)\s+hair\b/i, name: "running hand through hair" },
    { regex: /\b(?:rub(?:s|bed|bing)?)\s+(?:the\s+(?:back|nape)\s+of\s+)?(?:his|her|their)\s*neck\b/i, name: "rubbing neck" },
    { regex: /\bclear(?:s|ed|ing)\s+(?:his|her|their)\s*throat\b/i, name: "clearing throat" },
    { regex: /\bpause[sd]?|pausing\b/i, name: "pausing" },
  ];

  const found = new Set<string>();
  for (const turn of turns) {
    for (const cat of categories) {
      if (cat.regex.test(turn)) {
        found.add(cat.name);
      }
    }
  }
  return Array.from(found);
}

export function looksRepetitive(text: string, priorAssistant: string[]): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const currentWords = normalized.split(" ");
  const currentPrefix = currentWords.slice(0, 5).join(" ");
  const currentContent = currentWords.filter(
    (w) => w.length > 3 && !PHRASE_STOP_WORDS.has(w),
  );

  const fillerHits = normalized.match(/\b(?:softly|gently|quietly|slowly|tenderly)\b/g) || [];
  if (fillerHits.length >= 3) return true;

  const fourGrams = new Map<string, number>();
  for (let i = 0; i <= currentWords.length - 4; i++) {
    const gram = currentWords.slice(i, i + 4).join(" ");
    const next = (fourGrams.get(gram) || 0) + 1;
    if (next >= 2) return true;
    fourGrams.set(gram, next);
  }

  for (const prev of priorAssistant.slice(-4)) {
    const p = prev.toLowerCase().replace(/\s+/g, " ").trim();
    if (!p) continue;
    if (normalized === p) return true;
    if (normalized.includes(p) && p.length > 60) return true;

    const prevWords = p.split(" ");
    const prevPrefix = prevWords.slice(0, 5).join(" ");
    if (currentPrefix.length > 12 && prevPrefix === currentPrefix) return true;

    const currentActions = text.match(/\*[^*]+\*/g) || [];
    const prevActions = prev.match(/\*[^*]+\*/g) || [];
    for (const ca of currentActions) {
      const normCA = ca.toLowerCase().replace(/\s+/g, " ").trim();
      if (normCA.length < 25) continue;
      for (const pa of prevActions) {
        const normPA = pa.toLowerCase().replace(/\s+/g, " ").trim();
        if (normCA === normPA) return true;
      }
    }

    const prevContent = prevWords.filter((w) => w.length > 3 && !PHRASE_STOP_WORDS.has(w));
    const contentSet = new Set(currentContent);
    const overlap = prevContent.filter((w) => contentSet.has(w)).length;
    const smaller = Math.min(currentContent.length, prevContent.length);
    if (smaller >= 4 && overlap / smaller >= 0.7) return true;

    const a = new Set(currentWords);
    const b = new Set(prevWords);
    const inter = [...a].filter((x) => b.has(x)).length;
    const union = new Set([...a, ...b]).size;
    if (union > 0 && inter / union > 0.65) return true;
  }
  return false;
}

export function validateInCharacterOutput(params: {
  output: string;
  selfName: string;
  sceneState: SceneState | null;
  userName?: string | null;
}): { ok: boolean; reasons: string[] } {
  const { output, selfName, sceneState, userName } = params;
  const text = output.trim();
  const reasons: string[] = [];
  if (!text) reasons.push("empty");

  const actionBlocks = text.match(/\*[^*]+\*/g) || [];
  const dialogueOnly = text.replace(/\*[^*]*\*/g, " ").trim();

  // Action narration must stay third-person
  if (/\*[^*]*\b(I|me|my|myself|mine)\b[^*]*\*/i.test(text)) {
    reasons.push("first_person_in_action_narration");
  }

  // Never puppet the user inside action beats
  const userBody = /\byou\s+(?:feel|felt|gasp|gasps|moan|moans|shiver|shivers|blush|blushes|tremble|trembles|whimper|whimpers|arch|arch(?:es|ed)|clench|can't|cannot|can\s+not)\b/i;
  for (const block of actionBlocks) {
    if (/^\*\s*you\b/i.test(block) || userBody.test(block)) {
      reasons.push("user_puppeting");
      break;
    }
  }

  // Ban dialogue tags in spoken text
  if (/\bI\s+(say|mutter|whisper|murmur|exclaim|shout|reply|state|add|continue|pant)\b/i.test(dialogueOnly)) {
    reasons.push("dialogue_tag_in_spoken_text");
  }

  const quotesCount = (text.match(/"[^"]+"/g) || []).length;
  if (actionBlocks.length > 4 || quotesCount > 4) {
    reasons.push("turn_exceeds_length_cap");
  }
  if (text.split(/\s+/).filter(Boolean).length > 280) {
    reasons.push("turn_exceeds_length_cap");
  }

  const fillerHits = text.match(/\b(?:softly|gently|quietly|slowly|tenderly)\b/gi) || [];
  if (fillerHits.length >= 3) {
    reasons.push("filler_adverb_spam");
  }

  if (dialogueOnly.length > 0 && selfName) {
    const escapedName = selfName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escapedName}\\b`, "i").test(dialogueOnly)) {
      reasons.push(`third_person_self_reference_in_dialogue:${selfName}`);
    }

    const nameOrYou = userName ? `(?:you|${userName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})` : "you";
    if (
      new RegExp(`\\bjust\\s+(?:him|her|them)\\s+and\\s+${nameOrYou}\\b`, "i").test(dialogueOnly) ||
      new RegExp(`\\bjust\\s+${nameOrYou}\\s+and\\s+(?:him|her|them)\\b`, "i").test(dialogueOnly)
    ) {
      reasons.push("third_person_pronoun_self_reference_in_dialogue");
    }
  }

  if (
    /\b(?:golden|amber|emerald|crimson|ruby|sapphire|yellow|hazel|blue|green|red|violet|piercing|heavy|intense)\s+(?:eyes?|gaze|orbs?)\b/i.test(text) ||
    /\b(?:his|her|their)\s+(?:eyes?|gaze)\s+(?:soften|softens|darken|darkens|harden|hardens|narrow|narrows|flicker|flickers|gleam|gleams|widen|widens|burn|burns)\b/i.test(text) ||
    /\b(?:sharp|pointed|gleaming)\s+(?:teeth|fangs?|canines?)\b/i.test(text) ||
    /\b(?:fangs?|sharp\s+canines?)\s+(?:flash|glint|graze|sink|bare|peeking|catch)\b/i.test(text) ||
    /\b(?:ears?\s+(?:twitch|twitches|pin|pins|flatten|flattens)|tail\s+(?:sways?|flicks?|lashes?))\b/i.test(text)
  ) {
    reasons.push("repetitive_appearance_trope");
  }

  const banned = [
    "as an ai",
    "language model",
    "i can't help with that",
    "i cannot help with that",
    "i'm not able to roleplay",
    "i am not able to roleplay",
    "cannot continue this roleplay",
  ];
  const lowered = text.toLowerCase();
  for (const phrase of banned) {
    if (lowered.includes(phrase)) {
      reasons.push(`ooc_phrase:${phrase}`);
      break;
    }
  }

  if (selfName) {
    const escapedName = selfName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\byou\\s+are\\s+${escapedName}\\b`, "i").test(dialogueOnly)) {
      reasons.push("alias_as_user_name");
    }
  }

  if (sceneState?.location && sceneState.location.length > 0) {
    const hint = sceneState.location.toLowerCase().split(" ")[0];
    if (hint.length >= 4 && lowered.includes("teleport") && !lowered.includes(hint)) {
      reasons.push("scene_drift");
    }
  }

  return { ok: reasons.length === 0, reasons };
}

const PHRASE_STOP_WORDS = new Set([
  "the", "and", "a", "to", "of", "in", "it", "is", "that", "you",
  "he", "she", "they", "his", "her", "their", "my", "was", "for",
  "on", "are", "as", "with", "at", "be", "this", "have", "from",
  "or", "one", "had", "by", "word", "but", "not", "what", "all",
  "were", "we", "when", "your", "can", "said", "there", "use",
  "an", "each", "which", "do", "how", "if", "up", "so", "then",
  "just", "about", "into", "over", "out", "me", "him", "them",
]);

function ngramsFromTurn(
  turn: string,
  minLen: number,
  maxLen: number,
  minContentLength = 1,
  minContentWords = 1,
): Set<string> {
  const cleaned = turn.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean);
  const ngrams = new Set<string>();
  for (let len = maxLen; len >= minLen; len--) {
    for (let i = 0; i <= words.length - len; i++) {
      const slice = words.slice(i, i + len);
      const content = slice.filter(
        (w) => !PHRASE_STOP_WORDS.has(w) && w.length >= minContentLength,
      );
      if (content.length >= minContentWords && slice.length >= minLen) {
        ngrams.add(slice.join(" "));
      }
    }
  }
  return ngrams;
}

function collapseSubstringPhrases(phrases: string[], limit: number): string[] {
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  const filtered: string[] = [];
  for (const r of sorted) {
    if (!filtered.some((f) => f.includes(r))) {
      filtered.push(r);
    }
  }
  return filtered.slice(0, limit);
}

export function extractRepeatedPhrases(turns: string[]): string[] {
  if (!turns || turns.length < 2) return [];

  const turnNgrams = turns.map((turn) => ngramsFromTurn(turn, 2, 5, 1, 1));

  const counts = new Map<string, number>();
  for (const set of turnNgrams) {
    for (const ng of set) {
      counts.set(ng, (counts.get(ng) || 0) + 1);
    }
  }

  const repeated: string[] = [];
  for (const [ng, count] of counts.entries()) {
    if (count >= 2) {
      repeated.push(ng);
    }
  }

  return collapseSubstringPhrases(repeated, 5);
}

/**
 * Distinctive 3–5 word spans from the immediately previous reply.
 * These do not need to have been repeated yet — last-turn copy is the usual source of echo.
 */
export function extractLastTurnPhrases(turn: string): string[] {
  if (!turn || typeof turn !== "string") return [];
  return collapseSubstringPhrases(Array.from(ngramsFromTurn(turn, 3, 5, 4, 2)), 4);
}
