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

      // 1. Eye / Gaze tropes
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

      // 2. Fangs / teeth tropes
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

      const subj = "(?:(?:he|she|they|[A-Z][a-z]+)\\s+)?";
      const soundAdj = "(?:low|soft|quiet|dry|dark|deep|faint|wry|slight|small|gentle|heavy|shaky|sharp)?";
      const soundNouns = "(?:chuckle|sigh|groan|growl|murmur|whisper|smirk|grin|snort|grunt|gasp|huff|chuckle-sigh|breath)";

      // 4. "With a [sound/expression]..." prepositional clauses
      cleaned = cleaned.replace(
        new RegExp(`^(?:with\\s+)(?:a\\s+)?${soundAdj}\\s*${soundNouns}(?:,\\s*|\\s+(?:as|while|and)\\s+)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        new RegExp(`^(?:with\\s+)(?:a\\s+)?${soundAdj}\\s*${soundNouns}\\.?$`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        new RegExp(`(?:,\\s*)(?:with\\s+)(?:a\\s+)?${soundAdj}\\s*${soundNouns}[^,.*]*`, "gi"),
        "",
      );

      // 5. Vocal sound clichés & verbs: chuckles, groans, sighs, growls, murmurs, breath hitching
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:chuckles?|groans?|sighs?|murmurs?|whispers?|gasps?|growls?|snorts?|grunts?|mutters?|huffs?|smirks?|grins?|chuckling|sighing|groaning|murmuring|whispering|gasping|growling|snorting|grunting|muttering|huffing|smirking|grinning)\\s*(?:softly|quietly|low|dryly|darkly|deeply|gently|faintly|wryly|heavily|shakily|nervously|under\\s+(?:his|her|their)?\\s*breath)?(?:\\s+(?:and|as|while)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:lets?\\s+out|gives?|offers?|releases?|emits?|suppresses?|stifles?|chokes?\\s+back|swallows?)\\s+(?:a\\s+)?${soundAdj}\\s*${soundNouns}(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        new RegExp(`^(?:a\\s+)?${soundAdj}\\s*${soundNouns}\\s+(?:escapes?|rumbles?|leaves?|vibrates?)\\s+(?:from|in|against|past)?\\s*(?:his|her|their)?\\s*(?:chest|throat|lips|mouth)?(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        new RegExp(`(?:,\\s*)(?:a\\s+)?${soundAdj}\\s*${soundNouns}\\s+(?:escapes?|rumbles?|leaves?|vibrates?)\\s+(?:from|in|against|past)?\\s*(?:his|her|their)?\\s*(?:chest|throat|lips|mouth)?[^,.*]*`, "gi"),
        "",
      );

      // Breath hitches / catches / holding breath
      cleaned = cleaned.replace(
        new RegExp(`^(?:(?:a\\s+)?breath\\s+(?:hitches?|catches?|trapped)\\s+(?:in\\s+(?:his|her|their)?\\s*throat)?|(?:his|her|their)\\s+breath\\s+hitches?)(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)?(?:his|her|their)?\s*breath\s+(?:hitches?|catches?|fans?\s+across\s+[a-z\s]+)[^,.*]*/gi,
        "",
      );
      cleaned = cleaned.replace(
        new RegExp(`(?:,\\s*)?${subj}lets?\\s+out\\s+a\\s+breath\\s+(?:he|she|they)\\s+(?:didn't|did\\s+not)\\s+(?:know|realize)\\s+(?:he|she|they)\\s+(?:was|were)\\s+holding[^,.*]*`, "gi"),
        "",
      );

      // Standalone vocal endings: e.g. "He chuckles softly." or ", a soft sigh escaping."
      cleaned = cleaned.replace(
        new RegExp(`(?:^|,\\s*)?(?:${subj}(?:chuckles?|groans?|sighs?|murmurs?|whispers?|gasps?|growls?|snorts?|grunts?|mutters?|huffs?|smirks?|grins?)\\s*(?:softly|quietly|low|dryly|darkly|deeply|gently|faintly|wryly)?|(?:a\\s+)?${soundAdj}\\s*${soundNouns}\\s+(?:escapes?|rumbles?|leaves?|vibrates?)\\s+(?:from|in|against|past)?\\s*(?:his|her|their)?\\s*(?:chest|throat|lips)?)\\.?$`, "gi"),
        "",
      );

      // 6. Stock physical action clichés:
      // a) Head tilting
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:tilts?|tilting|cocks?|cocking)\\s+(?:his|her|their)?\\s*head\\s*(?:to\\s+the\\s+side|curiously|slightly|inquisitively)?(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)?(?:tilting|tilts|cocking|cocks)\s+(?:his|her|their)?\s*head\s*(?:to\s+the\s+side|curiously|slightly|inquisitively)?[^,.*]*/gi,
        "",
      );

      // b) Leaning against surfaces / leaning in
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:leans?|leaning)\\s+(?:back|in|closer|forward)?\\s*(?:against\\s+(?:the\\s+)?(?:wall|doorframe|door|counter|desk|table|chair|bar|railing|frame))?(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:leans?|leaning)\\s+(?:back|in|closer|forward)?\\s*(?:against\\s+(?:the\\s+)?(?:wall|doorframe|door|counter|desk|table|chair|bar|railing|frame))\\.?$`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)?(?:leaning|leans)\s+(?:back|in|closer|forward)?\s*(?:against\s+(?:the\\s+)?(?:wall|doorframe|door|counter|desk|table|chair|bar|railing|frame))[^,.*]*/gi,
        "",
      );

      // c) Shifting weight
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:shifts?|shifting)\\s+(?:his|her|their)?\\s*weight\\s*(?:from\\s+one\\s+foot\\s+to\\s+the\\s+other)?(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)?(?:shifting|shifts)\s+(?:his|her|their)?\s*weight[^,.*]*/gi,
        "",
      );

      // d) Crossing arms
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:crosses?|crossing|folds?|folding)\\s+(?:his|her|their)?\\s*arms\\s*(?:over\\s+(?:his|her|their)?\\s*chest)?(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)?(?:crossing|crosses|folding|folds)\s+(?:his|her|their)?\s*arms[^,.*]*/gi,
        "",
      );

      // e) Raising / arching eyebrow
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:raises?|raising|arches?|arching)\\s+(?:an?|his|her|their)?\\s*(?:eyebrow|brow)(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)?(?:raising|raises|arching|arches)\s+(?:an?|his|her|their)?\s*(?:eyebrow|brow)[^,.*]*/gi,
        "",
      );

      // f) Hand through hair / rubbing neck
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:runs?|running|ran)\\s+(?:a|his|her|their)\\s+hand\\s+through\\s+(?:his|her|their)?\\s*(?:dark|messy|blonde|silver)?\\s*hair(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)?(?:runs?|running|ran)\s+(?:a|his|her|their)\\s+hand\\s+through\\s+(?:his|her|their)?\\s*(?:dark|messy|blonde|silver)?\\s*hair[^,.*]*/gi,
        "",
      );
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:rubs?|rubbing|rubbed)\\s+(?:the\\s+(?:back|nape)\\s+of\\s+)?(?:his|her|their)\\s*neck(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)?(?:rubs?|rubbing|rubbed)\s+(?:the\\s+(?:back|nape)\\s+of\\s+)?(?:his|her|their)\\s*neck[^,.*]*/gi,
        "",
      );

      // h) Clearing throat
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:clears?|clearing)\\s+(?:his|her|their)?\\s*throat\\s*(?:softly|quietly)?(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)?(?:clears?|clearing)\s+(?:his|her|their)\s*throat[^,.*]*/gi,
        "",
      );

      // 7. Animal ears / tail tropes
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

  for (const prev of priorAssistant.slice(-4)) {
    const p = prev.toLowerCase().replace(/\s+/g, " ").trim();
    if (!p) continue;
    if (normalized === p) return true;
    if (normalized.includes(p) && p.length > 60) return true;

    // Detect formulaic opening pattern repetition
    const prevWords = p.split(" ");
    const prevPrefix = prevWords.slice(0, 5).join(" ");
    if (currentPrefix.length > 12 && prevPrefix === currentPrefix) return true;

    // Detect repeated action blocks
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

  // 1. Action narration must stay third-person (no I/me/my/myself inside asterisks)
  if (/\*[^*]*\b(I|me|my|myself|mine)\b[^*]*\*/i.test(text)) {
    reasons.push("first_person_in_action_narration");
  }

  // 2. Ban dialogue tags like "I say", "I mutter", "I whisper" in spoken text
  const dialogueOnly = text.replace(/\*[^*]*\*/g, " ").trim();
  if (/\bI\s+(say|mutter|whisper|murmur|exclaim|shout|reply|state|add|continue|pant)\b/i.test(dialogueOnly)) {
    reasons.push("dialogue_tag_in_spoken_text");
  }

  // 3. Turn length cap (max 4 action blocks or quotes per turn for smooth pacing)
  const actionBlocks = (text.match(/\*[^*]+\*/g) || []).length;
  const quotesCount = (text.match(/"[^"]+"/g) || []).length;
  if (actionBlocks > 4 || quotesCount > 4) {
    reasons.push("turn_exceeds_length_cap");
  }

  // 3. Spoken dialogue (text outside *asterisks*) must stay first-person (no third-person self-references)
  if (dialogueOnly.length > 0 && selfName) {
    const escapedName = selfName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp(`\\b${escapedName}\\b`, "i");
    if (nameRegex.test(dialogueOnly)) {
      reasons.push(`third_person_self_reference_in_dialogue:${selfName}`);
    }

    const nameOrYou = userName ? `(?:you|${userName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})` : "you";
    if (new RegExp(`\\bjust\\s+(?:him|her|them)\\s+and\\s+${nameOrYou}\\b`, "i").test(dialogueOnly) ||
        new RegExp(`\\bjust\\s+${nameOrYou}\\s+and\\s+(?:him|her|them)\\b`, "i").test(dialogueOnly)) {
      reasons.push("third_person_pronoun_self_reference_in_dialogue");
    }
  }

  // 4. Ban repetitive self-appearance tropes, gaze clichés, and redundant physical descriptors
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
  ];
  for (const phrase of banned) {
    if (text.toLowerCase().includes(phrase)) {
      reasons.push(`ooc_phrase:${phrase}`);
      break;
    }
  }

  const lowered = text.toLowerCase();
  if (new RegExp(`\\b${selfName.toLowerCase()}\\b`).test(lowered) && /\byou\s+are\s+/.test(lowered)) {
    reasons.push("alias_as_user_name");
  }

  if (sceneState?.location && sceneState.location.length > 0) {
    const hint = sceneState.location.toLowerCase().split(" ")[0];
    if (hint.length >= 4 && lowered.includes("teleport") && !lowered.includes(hint)) {
      reasons.push("scene_drift");
    }
  }

  return { ok: reasons.length === 0, reasons };
}
