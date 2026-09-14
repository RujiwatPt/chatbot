import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { model, SUMMARIZER_MODEL } from "@/lib/openrouter";
import { SCENE_STATE_SYSTEM, SUMMARIZER_SYSTEM } from "@/lib/prompts";
import { decryptText, encryptText } from "@/lib/encryption";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type Character = {
  name: string;
  alias: string | null;
  persona: string;
  scenario: string | null;
  greeting: string | null;
  model: string;
  tags?: string[] | null;
};

export type SceneState = {
  location: string;
  tone: string;
  relationship: string;
  goal: string;
};

// Cap on messages fetched past the summary marker before token-budget pruning
const POST_SUMMARY_CAP = 60;

// Max estimated tokens allowed in the verbatim recent message window (~4500 tokens ≈ 18,000 chars)
export const MAX_RECENT_TOKENS = 4500;

// Max estimated tokens allowed for the entire system prompt payload (~2500 tokens)
export const MAX_SYSTEM_TOKENS = 2500;

// Re-summarize when there are at least this many messages past the recent
// window since the last summary (i.e. older than the tail-N we keep verbatim).
const SUMMARIZE_MIN_NEW = 10;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function isFactRedundant(existingFact: string, newFact: string): boolean {
  const normA = existingFact.toLowerCase().replace(/\[.*?\]/g, "").replace(/[^\w\s]/g, "").trim();
  const normB = newFact.toLowerCase().replace(/\[.*?\]/g, "").replace(/[^\w\s]/g, "").trim();

  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  const wordsA = new Set(normA.split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(normB.split(/\s+/).filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const smallerSize = Math.min(wordsA.size, wordsB.size);

  return intersection / smallerSize >= 0.75;
}

export function deduplicateFacts(existingFacts: string[], newFacts: string[]): string[] {
  const result: string[] = [];
  for (const nf of newFacts) {
    const isDup = existingFacts.some((ef) => isFactRedundant(ef, nf)) || result.some((rf) => isFactRedundant(rf, nf));
    if (!isDup) {
      result.push(nf);
    }
  }
  return result;
}

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
        `^(?:with\\s+)?(?:his|her|their|my)?\\s*(?:${eyeAdjectives}\\s*){1,2}${eyeNouns}\\s+${eyeVerbs}(?:,\\s*|\\s+(?:as|while)\\s+)`,
        "gi",
      );
      cleaned = cleaned.replace(r1, "");
      const r2 = new RegExp(
        `^(?:his|her|their|my)?\\s*(?:${eyeAdjectives}\\s*){1,2}${eyeNouns}\\s+${eyeVerbs}(?:\\s+with\\s+[a-z]+)?(?:[.,;]|\\s+and\\s+)?`,
        "gi",
      );
      cleaned = cleaned.replace(r2, "");
      const r3 = new RegExp(
        `(?:,\\s*|\\s+with\\s+)(?:his|her|their|my)?\\s*(?:${eyeAdjectives}\\s*){1,2}${eyeNouns}\\s*`,
        "gi",
      );
      cleaned = cleaned.replace(r3, (m) => (m.startsWith(",") ? ", " : " "));
      const r4 = new RegExp(
        `(?:,\\s*)?(?:his|her|their|my)?\\s*${eyeNouns}\\s+${eyeVerbs}(?:\\s+with\\s+[a-z]+)?`,
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
        /^(?:a\s+)?(?:smirk|grin)\s+(?:plays?|playing|tugs?|tugging|curls?|curling|spreads?|spreading|ghosts?|ghosting|creeps?|creeping)\s+(?:on|across|at)\s+(?:his|her|their)?\s*(?:lips|mouth|face)(?:,\s*|\s+(?:as|while)\s+)?/gi,
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)(?:a\s+)?(?:smirk|grin)\s+(?:plays?|playing|tugs?|tugging|curls?|curling|spreads?|spreading|ghosts?|ghosting|creeps?|creeping)\s+(?:on|across|at)\s+(?:his|her|their)?\s*(?:lips|mouth|face)[^,.*]*/gi,
        "",
      );

      const subj = "(?:(?:he|she|they|[A-Z][a-z]+)\\s+)?";

      // 4. Vocal sound clichés: chuckles, groans, sighs, growls, murmurs, breath hitching
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:chuckles?|groans?|sighs?|murmurs?|whispers?|chuckling|sighing|groaning|murmuring|whispering)\\s*(?:softly|quietly|low|dryly|darkly|under\\s+(?:his|her|their)?\\s*breath)?(?:\\s+(?:and|as|while)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /^(?:a\s+)?(?:low|soft|quiet|dry|dark|deep)?\s*(?:chuckle|groan|sigh|growl|murmur)\s+(?:escapes?|rumbles?|leaves?|vibrates?)\s+(?:from\s+)?(?:his|her|their)?\s*(?:chest|throat|lips)?(?:\s+(?:as|while|and)\s+|,\s*)/gi,
        "",
      );
      cleaned = cleaned.replace(
        new RegExp(`^${subj}lets?\\s+out\\s+a\\s+(?:low|soft|quiet|heavy|shaky|deep)?\\s*(?:chuckle|sigh|groan|growl|breath)(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        new RegExp(`^(?:(?:a\\s+)?breath\\s+(?:hitches?|catches?|trapped)\\s+(?:in\\s+(?:his|her|their)?\\s*throat)?|his\\s+breath\\s+hitches?)(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
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
      cleaned = cleaned.replace(
        new RegExp(`(?:^|,\\s*)?(?:${subj}(?:chuckles?|groans?|sighs?|murmurs?|whispers?)\\s*(?:softly|quietly|low|dryly)?|(?:a\\s+)?(?:low|soft|quiet|dry|dark|deep)?\\s*(?:chuckle|groan|sigh|growl|murmur)\\s+(?:escapes?|rumbles?|leaves?|vibrates?)\\s+(?:from\\s+)?(?:his|her|their)?\\s*(?:chest|throat|lips)?)\\.?$`, "gi"),
        "",
      );

      // 5. Stock action clichés:
      // a) Head tilting: "He tilts his head to the side as...", "Tilting his head slightly,..."
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:tilts?|tilting|cocks?|cocking)\\s+(?:his|her|their)?\\s*head\\s*(?:to\\s+the\\s+side|curiously|slightly|inquisitively)?(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)?(?:tilting|tilts|cocking|cocks)\s+(?:his|her|their)?\s*head\s*(?:to\s+the\s+side|curiously|slightly|inquisitively)?[^,.*]*/gi,
        "",
      );

      // b) Leaning against surfaces
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:leans?|leaning)\\s+(?:back|in|forward)?\\s*(?:against\\s+(?:the\\s+)?(?:wall|doorframe|door|counter|desk|table|chair|bar|railing|frame))?(?:\\s+(?:as|while|and)\\s+|,\\s*)`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        new RegExp(`^${subj}(?:leans?|leaning)\\s+(?:back|in|forward)?\\s*(?:against\\s+(?:the\\s+)?(?:wall|doorframe|door|counter|desk|table|chair|bar|railing|frame))\\.?$`, "gi"),
        "",
      );
      cleaned = cleaned.replace(
        /(?:,\s*)?(?:leaning|leans)\s+(?:back|in|forward)?\s*(?:against\s+(?:the\s+)?(?:wall|doorframe|door|counter|desk|table|chair|bar|railing|frame))[^,.*]*/gi,
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

      // 6. Animal ears / tail tropes
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
    { regex: /\b(?:murmur[sd]?|murmuring)\b/i, name: "murmur/murmuring" },
    { regex: /\b(?:hum(?:s|med|ming)?)\b/i, name: "hum/humming" },
    { regex: /\bbreath\s+(?:hitches?|hitching|catches?|catching|fanning)\b/i, name: "breath hitching" },
    { regex: /\b(?:tilt(?:s|ed|ing)?|cock(?:s|ed|ing)?)\s+(?:his|her|their)?\s*head\b/i, name: "head tilting" },
    { regex: /\b(?:smirk[sd]?|smirking)\b/i, name: "smirk/smirking" },
    { regex: /\b(?:step[sd]?|stepping)\s+(?:closer|forward|back)\b/i, name: "stepping closer/away" },
    { regex: /\blean(?:s|ed|ing)?\s+(?:in|closer|forward|against|back)\b/i, name: "leaning" },
    { regex: /\bshift(?:s|ed|ing)?\s+(?:his|her|their)?\s*weight\b/i, name: "shifting weight" },
    { regex: /\b(?:cross(?:es|ed|ing)?|fold(?:s|ed|ing)?)\s+(?:his|her|their)?\s*arms\b/i, name: "crossing arms" },
    { regex: /\b(?:arch(?:es|ed|ing)?|rais(?:es|ed|ing)?)\s+(?:an?|his|her|their)?\s*(?:eyebrow|brow)\b/i, name: "eyebrow raising" },
    { regex: /\b(?:run(?:s|ning)?|ran)\s+(?:a|his|her|their)\s+hand\s+through\s+(?:his|her|their)\s+hair\b/i, name: "running hand through hair" },
    { regex: /\b(?:rub(?:s|bed|bing)?)\s+(?:the\s+back\s+of\s+)?(?:his|her|their)\s*neck\b/i, name: "rubbing neck" },
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

export function buildSystemPrompt(opts: {
  character: Character;
  facts: string[];
  sceneState: SceneState | null;
  summary: string | null;
  feedback?: string[];
  userName?: string | null;
  userPronouns?: string | null;
  userDescription?: string | null;
  priorAssistant?: string[];
}) {
  const { character, facts, sceneState, summary, feedback } = opts;
  const selfName = character.alias?.trim() || character.name;
  const userName = opts.userName?.trim() || "";
  const userPronouns = opts.userPronouns?.trim() || "";
  const userDescription = opts.userDescription?.trim() || "";
  const parts: string[] = [];

  parts.push(
    `[ROLEPLAY MODE: Active]\nYou are portraying ${selfName} in an ongoing immersive roleplay scenario. Maintain high engagement, emotional resonance, and strict character adherence.`,
  );

  parts.push(
    `<character_definition>\nName: ${selfName}\nPersona & Traits:\n${character.persona}\n${
      character.scenario ? `Scenario: ${character.scenario}\n` : ""
    }${
      character.greeting
        ? `Greeting Anchor / Voice Reference:\n${character.greeting}\n`
        : ""
    }[Visual Reference Note: Physical details in this definition are static visual facts for the user. Do NOT repeat or re-describe ${selfName}'s physical appearance in your narration.]\n</character_definition>`,
  );

  if (userName || userPronouns || userDescription) {
    parts.push(
      `<user_profile>\nThe user you are speaking with${
        userName ? ` is named ${userName}` : ""
      }.${
        userPronouns ? ` Preferred pronouns: ${userPronouns}.` : ""
      }${
        userDescription ? `\nUser Description / Persona:\n${userDescription}` : ""
      }\n</user_profile>`,
    );
  }

  if (sceneState) {
    parts.push(
      `<scene_state>\nLocation: ${sceneState.location}\nEmotional Tone: ${sceneState.tone}\nRelationship: ${sceneState.relationship}\nCurrent Goal: ${sceneState.goal}\n</scene_state>`,
    );
  }

  if (facts.length) {
    parts.push(
      `<durable_facts>\n${facts.map((f) => `- ${f}`).join("\n")}\n</durable_facts>`,
    );
  }

  if (summary) {
    parts.push(`<narrative_summary>\n${summary}\n</narrative_summary>`);
  }

  const isRomanticOrNsfw = Boolean(
    character.tags?.some((t) => {
      const lower = t.toLowerCase();
      return lower === "nsfw" || lower === "romance";
    }),
  );

  const directives: string[] = [
    `RESPONSE CONTRACT:`,
    `- Stay 100% in character as ${selfName} at all times. Never output AI disclaimers or assistant phrases.`,
    `- User Agency & Anti-Autoplay (CRITICAL RULE):`,
    `  - NEVER speak, act, react, think, or make decisions for the user. Never narrate the user's responses or bodily reactions.`,
    `  - Play ONLY ${selfName}. Advance the story one single beat at a time based only on what the user actually said or did.`,
    `  - Do NOT rush ahead, skip story beats, or process entire scenarios on your own without user input. Always pause and leave room for the user to respond.`,
    `- Concise & Interactive Turn Length (NO RAMBLING):`,
    `  - Keep your turns concise, punchy, and conversational (1 to 3 short paragraphs max, ~80–200 words).`,
    `  - Strictly avoid long monologues, over-explaining, repetitive inner rambling, or walls of text.`,
    isRomanticOrNsfw
      ? `- Intimate & Sensual Scenes (Atmosphere, Mutual Pleasure & Climax Progression):
  - Active Attentiveness to User's Pleasure: When intimate or sensual scenes unfold, ${selfName} must be deeply attentive, passionate, and responsive to the user's pleasure and comfort. Actively encourage the user, respond to their desires, and prioritize mutual enjoyment.
  - Climax & Peak Intensity Progression: Actively build physical and emotional tension toward mutual climax and release. When the user indicates rising pleasure or closeness to climax, enthusiastically match their intensity through encouraging whispers, shifting rhythm, breathless praise, and passionate physical responsiveness, guiding the encounter toward a deeply satisfying release and warm afterglow.
  - Vivid Atmospheric & Sensory Setting: Detail the immediate moment with rich environmental and sensory depth (ambient lighting, skin warmth, ragged breathing, heartbeat, vocal nuances, tremors, and tactile contact) while strictly avoiding repetitive self-appearance tropes.`
      : `- Interpersonal Connection & Emotional Resonance:
  - Deeply listen to the user, respond to their emotional state, and support their agency without forcing romance or intimacy unless explicitly initiated by the user.
  - Ground the dialogue in ${selfName}'s unique personality, professional boundaries, or companion dynamic.`,
    `- Format narration/actions in *asterisks* and spoken dialogue in plain text.`,
    `- Never break the fourth wall unless explicitly asked out-of-character by the user.`,
    `- Voice & Narration Split (STRICT REQUIREMENT):`,
    `  - ACTION & DESCRIPTION NARRATION (inside *asterisks*): MUST ALWAYS be written in third-person using ${selfName}'s name/nickname or third-person pronouns ("he", "she", "they", "his", "her"). ABSOLUTELY NEVER use first-person ("I", "me", "my", "myself", "we") inside *action narration* or descriptive statements.`,
    `  - Example (CORRECT): *${selfName} walks over to the window and looks out with a quiet smile.*`,
    `  - Example (FORBIDDEN): *I walk over to the window and look out with a quiet smile.*`,
    `  - SPOKEN DIALOGUE (outside asterisks): MUST ALWAYS be in natural first-person ("I", "me", "my", "mine", "myself"). NEVER refer to yourself using your own name (${selfName}) or third-person pronouns in spoken quotes.`,
    `- Direct Speech & Dialogue Tag Rules (STRICT):`,
    `  - Do NOT append written dialogue tags like '"...", I say', '"...", I mutter', or '"...", I whisper'.`,
    `  - Put purely spoken words inside quotes (e.g. "You're so beautiful, Jin.").`,
    `  - Put all vocal tone, physical actions, and speech descriptions inside *asterisks* in third-person (e.g. *He murmurs softly, his voice muffled against your neck.*).`,
    `  - NEVER output phrases like 'I say', 'I mutter', or 'I whisper' in plain text or dialogue.`,
    `- Output Formatting Rules (STRICT):`,
    `  - Spoken dialogue: MUST ALWAYS be inside double quotation marks ("...").`,
    `  - Physical actions & expressions: MUST ALWAYS be formatted inside *asterisks* (*action*).`,
    `  - Scene narration & background context: Plain normal text without quotes or asterisks.`,
    `- Turn Length & Pace Cap (CRITICAL FOR SMOOTH FLOW):`,
    `  - To maintain smooth, natural, and responsive conversation, each turn MUST NOT exceed:`,
    `    - Maximum 2 spoken dialogue quotes ("...")`,
    `    - Maximum 2 physical action blocks (*...*)`,
    `    - Maximum 2 narrative sentences`,
    `  - Keep your turn concise, punchy, and interactive. Never monologue or output wall-of-text blocks.`,
    `- Dynamic structural variety (STRICT): Vary your opening, sentence lengths, and response structure across turns. Do NOT repeat the same opening action, posture, or phrasing from previous messages. Mix dialogue-first openings, environmental reactions, internal feelings, and direct actions.`,
    userName
      ? `- User Addressing & Narration Rule: Address or refer to the user directly as "you"/"your" or by their name/alias (${userName}) in both narration (*actions*) and spoken dialogue ("quotes"). Do not assume the user's species or background without information.`
      : `- User Addressing & Narration Rule: Address or refer to the user directly as "you"/"your" in both narration (*actions*) and spoken dialogue ("quotes"). Do not assume or guess the user's species without explicitly stated information.`,
    userPronouns
      ? `- User Pronouns Rule: When referring to the user in third-person descriptive narration or reflective thoughts, strictly use their preferred pronouns (${userPronouns}). Never misgender the user.`
      : "",
    `- Replace Appearance Commentary with Action & Environment (STRICT MANDATE):`,
    `  - ZERO SELF-APPEARANCE COMMENTARY: The user already knows what ${selfName} looks like from the character definition. Under no circumstances should you describe, mention, or draw attention to ${selfName}'s own physical features, eyes, gaze changes, teeth, or bodily traits. Treat physical appearance as completely fixed background.`,
    `  - MANDATORY ACTION VARIETY: Fill every action block (*action*) exclusively with concrete physical actions and environment interaction. Focus 100% on what ${selfName} DOES or SAYS:`,
    `    * Real environment & prop interaction: interacting with objects in the room, setting down items, examining items, moving around the space.`,
    `    * Dynamic bodily movements: walking, turning around, sitting, gesturing, working on a task.`,
    `    * Spoken voice: direct spoken dialogue in quotes with distinct tone.`,
    `  - FORBIDDEN REPETITIVE TICS: Absolutely NEVER use repetitive sound clichés or stock gesture tics in your narration or actions. Specifically DO NOT USE:`,
    `    * Vocal sound tics: chuckles, chuckling, sighs, sighing, groans, murmuring, chest rumbles, breath hitching, or "letting out a breath they didn't know they were holding".`,
    `    * Stock physical tics: head tilting, leaning against surfaces/doorframes, shifting weight from foot to foot, crossing arms, arching/raising eyebrows, running a hand through hair, or repeatedly taking a step closer/closing the distance.`,
    `  - ZERO REPEATED SOUNDS OR ACTIONS: If you used an action or sound in a recent turn, you are FORBIDDEN from using it in this turn. Always vary your verbs, physical choices, and vocal delivery.`,
    `  - Focus 100% on what ${selfName} DOES, SAYS, or FEELS—never describe what ${selfName} looks like.`,
  ].filter(Boolean);

  if (opts.priorAssistant && opts.priorAssistant.length > 0) {
    const recentTurns = opts.priorAssistant.slice(-4);
    const recentOpenings = recentTurns
      .map((p) => {
        const cleaned = stripAppearanceTropes(p).trim();
        const sentenceMatch = cleaned.match(/^[^\n.!?]+[.!?]/);
        return sentenceMatch ? sentenceMatch[0].trim().slice(0, 75) : cleaned.slice(0, 50);
      })
      .filter(Boolean);

    const usedTics = extractUsedActionsAndSounds(recentTurns);

    if (recentOpenings.length > 0 || usedTics.length > 0) {
      const formattedOpenings = recentOpenings
        .map((s) => JSON.stringify(`${s.replace(/"/g, "'")}...`))
        .join(", ");
      directives.push(
        `- ANTI-REPETITION & VOCABULARY DIVERSITY MANDATE (CRITICAL):`,
        recentOpenings.length > 0
          ? `  - FORBIDDEN RECENT OPENINGS: Do NOT begin your response with any of these recent sentence openings or gestures: [${formattedOpenings}]. You MUST open with an entirely distinct action, spoken dialogue line, or reaction!`
          : "",
        usedTics.length > 0
          ? `  - [ACTIONS & SOUNDS USED IN RECENT TURNS — STRICTLY FORBIDDEN NOW]: You used the following actions/sounds in recent turns and CANNOT use them in this turn: [${usedTics.join(", ")}]. You MUST choose completely different verbs, physical movements, and expressions!`
          : "",
        `  - NO RECYCLED VERBS & GESTURES: Do NOT repeat the physical actions, vocalizations, or gestures you used in your recent turns. Choose completely distinct actions, alternate positioning, and new conversational beats.`,
        `  - NO DUPLICATE WORDING: Avoid reusing the same adjectives, metaphors, or pet phrases across turns. Introduce fresh phrasing and new conversational beats.`,
      );
    }
  }

  directives.push(
    `[FINAL REMINDER — ZERO APPEARANCE COMMENTARY]: Do NOT narrate or describe ${selfName}'s eyes, gaze, teeth, or physical body. Absolutely NO chuckles, sighs, groans, murmurs, leaning against surfaces, shifting weight, or head tilting. Progress the scene with fresh dialogue and concrete environment actions only.`,
  );

  if (feedback && feedback.length > 0) {
    if (feedback.includes("too_verbose")) {
      directives.push(
        `- USER PREFERENCE: Keep responses concise and punchy (1-3 short paragraphs maximum). Avoid long monologues.`,
      );
    }
    if (
      feedback.includes("more_in_character") ||
      feedback.includes("too_generic")
    ) {
      directives.push(
        `- USER PREFERENCE: Emphasize distinct character voice, mannerisms, and emotional reactions. Avoid generic or neutral phrasing.`,
      );
    }
  }

  let finalPrompt = [...parts, directives.join("\n\n")].join("\n\n");

  // Multi-stage fallback prompt budgeting to guarantee system prompt never overflows context limits
  if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS) {
    // Stage 1: Trim facts to 10
    const trimmedFacts = facts.slice(0, 10);
    let trimmedParts = parts.filter((p) => !p.startsWith("<durable_facts>"));
    if (trimmedFacts.length) {
      trimmedParts.push(
        `<durable_facts>\n${trimmedFacts.map((f) => `- ${f}`).join("\n")}\n</durable_facts>`,
      );
    }
    finalPrompt = [...trimmedParts, directives.join("\n\n")].join("\n\n");

    // Stage 2: Truncate summary to 1200 chars if still over
    if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS && summary) {
      const truncatedSummary = `${summary.slice(0, 1200)}...`;
      trimmedParts = trimmedParts.map((p) =>
        p.startsWith("<narrative_summary>")
          ? `<narrative_summary>\n${truncatedSummary}\n</narrative_summary>`
          : p,
      );
      finalPrompt = [...trimmedParts, directives.join("\n\n")].join("\n\n");
    }

    // Stage 3: Trim persona if still over
    if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS && character.persona.length > 800) {
      const trimmedPersona = `${character.persona.slice(0, 800)}...`;
      trimmedParts = trimmedParts.map((p) =>
        p.startsWith("<character_definition>")
          ? `<character_definition>\nName: ${selfName}\nPersona & Traits:\n${trimmedPersona}\n${
              character.scenario ? `Scenario: ${character.scenario}\n` : ""
            }${
              character.greeting
                ? `Greeting Anchor / Voice Reference:\n*${character.greeting}*\n`
                : ""
            }</character_definition>`
          : p,
      );
      finalPrompt = [...trimmedParts, directives.join("\n\n")].join("\n\n");
    }

    // Stage 4: Drop optional sections cleanly before raw line-boundary slice fallback
    if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS) {
      trimmedParts = trimmedParts.filter((p) => !p.startsWith("<narrative_summary>"));
      finalPrompt = [...trimmedParts, directives.join("\n\n")].join("\n\n");
    }
    if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS) {
      trimmedParts = trimmedParts.filter((p) => !p.startsWith("<durable_facts>"));
      finalPrompt = [...trimmedParts, directives.join("\n\n")].join("\n\n");
    }
    if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS) {
      trimmedParts = trimmedParts.filter((p) => !p.startsWith("<scene_state>"));
      finalPrompt = [...trimmedParts, directives.join("\n\n")].join("\n\n");
    }
    if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS) {
      const maxChars = MAX_SYSTEM_TOKENS * 4;
      const rawSlice = finalPrompt.slice(0, maxChars);
      const lastNewline = rawSlice.lastIndexOf("\n");
      finalPrompt = lastNewline > maxChars * 0.7 ? rawSlice.slice(0, lastNewline) : rawSlice;
    }
  }

  return finalPrompt;
}

export async function loadChatContext(
  supabase: SupabaseClient,
  chatId: string,
): Promise<{
  character: Character;
  recent: ChatMessage[];
  facts: string[];
  sceneState: SceneState | null;
  summary: string | null;
  feedback: string[];
  userName: string | null;
  userPronouns: string | null;
  userDescription: string | null;
} | null> {
  // Parallelize initial database context fetches (chats, memories, feedback)
  const [chatRes, memoryRes, feedbackRes] = await Promise.all([
    supabase
      .from("chats")
      .select(
        "*, character:characters(name, alias, persona, scenario, greeting, model, tags)",
      )
      .eq("id", chatId)
      .maybeSingle(),
    supabase
      .from("memories")
      .select("kind, content, id, up_to_message_id")
      .eq("chat_id", chatId)
      .order("id", { ascending: false })
      .limit(60),
    supabase
      .from("message_feedback")
      .select("feedback")
      .eq("chat_id", chatId)
      .order("id", { ascending: false })
      .limit(10),
  ]);

  const chat = chatRes.data;
  const memoryRows = memoryRes.data;
  const feedbackRows = feedbackRes.data;

  const character = (
    Array.isArray(chat?.character) ? chat?.character[0] : chat?.character
  ) as Character | undefined;
  if (!character) return null;

  if (chat?.model) {
    character.model = chat.model;
  }

  const userId = chat?.user_id as string | undefined;
  const userName = (chat?.user_name as string | null) ?? null;
  const userPronouns = (chat?.user_pronouns as string | null) ?? null;
  const userDescription = (chat?.user_description as string | null) ?? null;

  const decryptedMemories = await Promise.all(
    (memoryRows ?? []).map(async (rawM) => ({
      kind: rawM.kind,
      up_to_message_id: rawM.up_to_message_id,
      decryptedContent: userId ? await decryptText(rawM.content, userId) : rawM.content,
    })),
  );

  const facts: string[] = [];
  let sceneState: SceneState | null = null;
  let summary: string | null = null;
  let summaryUpTo = 0;
  for (const rawM of decryptedMemories) {
    if (rawM.kind === "fact") {
      facts.push(rawM.decryptedContent);
    } else if (rawM.kind === "scene" && sceneState === null) {
      try {
        const parsed = JSON.parse(rawM.decryptedContent) as Partial<SceneState>;
        if (
          typeof parsed.location === "string" &&
          typeof parsed.tone === "string" &&
          typeof parsed.relationship === "string" &&
          typeof parsed.goal === "string"
        ) {
          sceneState = {
            location: parsed.location,
            tone: parsed.tone,
            relationship: parsed.relationship,
            goal: parsed.goal,
          };
        }
      } catch {
        // ignore malformed scene rows
      }
    } else if (rawM.kind === "summary" && summary === null) {
      summary = rawM.decryptedContent;
      summaryUpTo = (rawM.up_to_message_id as number | null) ?? 0;
    }
  }

  const feedback = Array.from(
    new Set((feedbackRows ?? []).map((f) => f.feedback as string)),
  );

  // Fetch recent messages newer than the summary, ordered most recent to oldest.
  const { data: rawMessages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .neq("content", "")
    .gt("id", summaryUpTo)
    .order("id", { ascending: false })
    .limit(POST_SUMMARY_CAP);

  const decryptedMessages = await Promise.all(
    (rawMessages ?? []).map(async (m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: userId ? await decryptText(m.content, userId) : m.content,
    })),
  );

  // Apply token-aware pruning from most recent to oldest
  const budgetedMessages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [];
  let accumulatedTokens = 0;
  for (const m of decryptedMessages) {
    const tokens = estimateTokens(m.content);
    if (budgetedMessages.length >= 4 && accumulatedTokens + tokens > MAX_RECENT_TOKENS) {
      break;
    }
    budgetedMessages.push(m);
    accumulatedTokens += tokens;
  }
  const recent = budgetedMessages.reverse();

  // Close Context Hole: Fold any unbudgeted messages between summaryUpTo and recent into summary
  if (decryptedMessages.length > budgetedMessages.length) {
    const unbudgeted = decryptedMessages.slice(budgetedMessages.length);
    const intermediateSummary = unbudgeted
      .map(
        (m) =>
          `${m.role === "user" ? "User" : character.name}: ${m.content.slice(0, 120)}${m.content.length > 120 ? "..." : ""}`,
      )
      .reverse()
      .join(" | ");

    if (summary) {
      summary = `${summary}\n\nRecent unsummarized transition: ${intermediateSummary}`;
    } else {
      summary = `Previous events: ${intermediateSummary}`;
    }
  }

  // Deduplicate durable facts
  const uniqueFacts = Array.from(new Set(facts));

  // Extract identity facts directly to enrich user description
  const identityFacts = uniqueFacts
    .filter((f) => f.startsWith("[identity]"))
    .map((f) => f.replace(/^\[identity\]\s*/, ""));

  // Derive and enrich user description from identity facts
  let effectiveUserDesc = userDescription;
  if (identityFacts.length) {
    if (!effectiveUserDesc) {
      effectiveUserDesc = identityFacts.join(". ");
    } else {
      const extraFacts = identityFacts.filter(
        (f) => !effectiveUserDesc!.toLowerCase().includes(f.toLowerCase()),
      );
      if (extraFacts.length) {
        effectiveUserDesc = `${effectiveUserDesc}\nLearned identity details: ${extraFacts.join("; ")}`;
      }
    }
  }

  // Prioritize and cap non-identity durable facts to top 30 to preserve context budget
  const nonIdentityFacts = uniqueFacts.filter((f) => !f.startsWith("[identity]"));
  const rank = (fact: string) => {
    if (fact.startsWith("[promise]")) return 0;
    if (fact.startsWith("[world]")) return 1;
    return 2;
  };
  nonIdentityFacts.sort((a, b) => rank(a) - rank(b));
  const finalFacts = nonIdentityFacts.slice(0, 30);

  return {
    character,
    recent,
    facts: finalFacts,
    sceneState,
    summary,
    feedback,
    userName,
    userPronouns,
    userDescription: effectiveUserDesc,
  };
}

function extractJson(text: string): unknown | null {
  if (!text) return null;
  // Free models sometimes wrap JSON in ```json fences or add prose. Find the
  // outermost {...} and try to parse.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const snippet = raw.slice(start, end + 1);
  try {
    return JSON.parse(snippet);
  } catch {
    try {
      const sanitized = snippet
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
      return JSON.parse(sanitized);
    } catch {
      return null;
    }
  }
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

    // Detect repeated action blocks (e.g., repeating identical *He continues to suck...* action lines)
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

export async function maybeSummarize(
  supabase: SupabaseClient,
  chatId: string,
  character: Character,
  userId?: string | null,
): Promise<void> {
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const { data: chat } = await supabase
      .from("chats")
      .select("user_id")
      .eq("id", chatId)
      .maybeSingle();
    resolvedUserId = chat?.user_id ?? null;
  }
  if (!resolvedUserId) return;
  const targetUserId = resolvedUserId;

  // Find the prior summary's progress marker
  const { data: prior } = await supabase
    .from("memories")
    .select("id, content, up_to_message_id")
    .eq("chat_id", chatId)
    .eq("kind", "summary")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sinceId: number = prior?.up_to_message_id ?? 0;

  // Dynamically determine oldestRecentId by walking messages backwards up to MAX_RECENT_TOKENS
  const { data: recentCandidateMessages } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("chat_id", chatId)
    .neq("content", "")
    .gt("id", sinceId)
    .order("id", { ascending: false })
    .limit(35);

  if (!recentCandidateMessages || recentCandidateMessages.length < 10) return;

  const candidateEstimates = await Promise.all(
    recentCandidateMessages.map(async (m) => ({
      id: m.id as number,
      tokens: estimateTokens(await decryptText(m.content, targetUserId)),
    })),
  );

  let accumulatedTokens = 0;
  let lastIncludedIndex = candidateEstimates.length - 1;
  for (let i = 0; i < candidateEstimates.length; i++) {
    const { tokens } = candidateEstimates[i];
    if (i >= 4 && accumulatedTokens + tokens > MAX_RECENT_TOKENS) {
      lastIncludedIndex = i - 1;
      break;
    }
    accumulatedTokens += tokens;
  }

  // When truncated, messages 0..lastIncludedIndex remain in recent; oldestRecentId is at lastIncludedIndex.
  // When not truncated, all candidate messages fit in recent; oldestRecentId is the oldest candidate message.
  const oldestRecentId = candidateEstimates[lastIncludedIndex].id;

  // Messages eligible to fold in: id < oldestRecentId AND id > sinceId
  const { data: toFold } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("chat_id", chatId)
    .neq("content", "")
    .gt("id", sinceId)
    .lt("id", oldestRecentId)
    .order("id", { ascending: true });
  if (!toFold) return;

  if (toFold.length < SUMMARIZE_MIN_NEW) return;

  const upTo = toFold[toFold.length - 1].id as number;

  const decryptedPrior = prior?.content ? await decryptText(prior.content, targetUserId) : null;
  const transcript = (
    await Promise.all(
      toFold.map(async (m) => `${m.role.toUpperCase()}: ${await decryptText(m.content, targetUserId)}`),
    )
  ).join("\n\n");

  const userPrompt = [
    `Character: ${character.name}`,
    `Persona: ${character.persona}`,
    character.scenario ? `Scenario: ${character.scenario}` : null,
    "",
    `PREVIOUS SUMMARY:\n${decryptedPrior?.trim() || "(none yet)"}`,
    "",
    "NEW MESSAGES TO FOLD IN:",
    transcript,
    "",
    'Respond with only a JSON object: {"summary": "...", "facts": [{"category":"identity|promise|world|other","content":"..."}]}',
  ]
    .filter(Boolean)
    .join("\n");

  let rawText = "";
  let raw: unknown = null;
  let attempts = 0;
  while (attempts < 2 && !raw) {
    attempts += 1;
    try {
      const { text } = await generateText({
        model: model(SUMMARIZER_MODEL),
        system: SUMMARIZER_SYSTEM,
        prompt: userPrompt,
        temperature: 0.2,
        abortSignal: AbortSignal.timeout(60000),
      });
      rawText = text;
      raw = extractJson(text);
    } catch {
      // Retry once on network/parse failure
    }
  }
  if (!raw || typeof raw !== "object") {
    console.warn("[summarizer] failed to parse JSON after 2 attempts", {
      chatId,
      model: character.model,
      snippet: rawText.slice(0, 200),
    });
    return;
  }
  const parsed = raw as { summary?: unknown; facts?: unknown };

  const summaryText =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const factsList: string[] = Array.isArray(parsed.facts)
    ? (parsed.facts as unknown[])
        .map((item) => {
          if (typeof item === "string") return `[other] ${item.trim()}`;
          if (!item || typeof item !== "object") return null;
          const c = item as { category?: unknown; content?: unknown };
          if (typeof c.content !== "string") return null;
          const category =
            typeof c.category === "string" ? c.category.toLowerCase() : "other";
          const normalized =
            category === "identity" ||
            category === "promise" ||
            category === "world"
              ? category
              : "other";
          return `[${normalized}] ${c.content.trim()}`;
        })
        .filter((f): f is string => Boolean(f))
        .filter((f) => f.length > 10)
    : [];

  if (!summaryText || summaryText.length < 60) {
    console.warn("[summarizer] summary quality gate failed (empty or too short)", {
      chatId,
      model: character.model,
      length: summaryText.length,
    });
    return;
  }

  if (toFold.length >= 20 && !/[A-Z][a-z]+/.test(summaryText)) {
    console.warn("[summarizer] summary quality gate failed", { chatId });
    return;
  }

  // Replace prior summary rows, insert new one
  await supabase
    .from("memories")
    .delete()
    .eq("chat_id", chatId)
    .eq("kind", "summary");
  await supabase.from("memories").insert({
    chat_id: chatId,
    kind: "summary",
    content: await encryptText(summaryText, targetUserId),
    up_to_message_id: upTo,
  });

  if (factsList.length) {
    const { data: existingFactRows } = await supabase
      .from("memories")
      .select("content")
      .eq("chat_id", chatId)
      .eq("kind", "fact");

    const existingFacts = await Promise.all(
      (existingFactRows ?? []).map(async (f) => decryptText(f.content, targetUserId)),
    );

    const novelFacts = deduplicateFacts(existingFacts, factsList);

    if (novelFacts.length) {
      const encryptedFacts = await Promise.all(
        novelFacts.map(async (content) => ({
          chat_id: chatId,
          kind: "fact",
          content: await encryptText(content, targetUserId),
          up_to_message_id: upTo,
        })),
      );
      await supabase.from("memories").insert(encryptedFacts);

      // Enforce Priority-Aware DB Fact Cap: Keep max 50 facts, evicting lowest-priority [other] facts first
      const { data: allFactRows } = await supabase
        .from("memories")
        .select("id, content")
        .eq("chat_id", chatId)
        .eq("kind", "fact")
        .order("id", { ascending: true });

      if (allFactRows && allFactRows.length > 50) {
        const decryptedWithRank = await Promise.all(
          allFactRows.map(async (f) => {
            const dec = await decryptText(f.content, targetUserId);
            const rank = dec.startsWith("[identity]")
              ? 0
              : dec.startsWith("[promise]")
                ? 1
                : dec.startsWith("[world]")
                  ? 2
                  : 3;
            return { id: f.id, rank };
          }),
        );

        // Sort lowest priority (highest rank 3: [other]) to the front for eviction
        decryptedWithRank.sort((a, b) => b.rank - a.rank);

        const excessCount = allFactRows.length - 50;
        const idsToDelete = decryptedWithRank.slice(0, excessCount).map((f) => f.id);
        await supabase.from("memories").delete().in("id", idsToDelete);
      }
    }
  }

  await refreshSceneState(supabase, chatId, character, targetUserId);
}

export async function refreshSceneState(
  supabase: SupabaseClient,
  chatId: string,
  character: Character,
  userId: string,
): Promise<void> {
  const { data: currentSceneMessages } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("chat_id", chatId)
    .neq("content", "")
    .order("id", { ascending: false })
    .limit(10);

  if (!currentSceneMessages || currentSceneMessages.length === 0) return;

  const upTo = currentSceneMessages[0].id as number;
  const tail = (
    await Promise.all(
      [...currentSceneMessages].reverse().map(
        async (m) => `${m.role}: ${await decryptText(m.content, userId)}`,
      ),
    )
  ).join("\n");

  try {
    const { text } = await generateText({
      model: model(SUMMARIZER_MODEL),
      system: SCENE_STATE_SYSTEM,
      prompt: `Character: ${character.name}\nPersona: ${character.persona}\nRecent turns:\n${tail}`,
    });
    const sceneRaw = extractJson(text);
    if (sceneRaw && typeof sceneRaw === "object") {
      const s = sceneRaw as Partial<SceneState>;
      if (
        typeof s.location === "string" &&
        typeof s.tone === "string" &&
        typeof s.relationship === "string" &&
        typeof s.goal === "string"
      ) {
        await supabase
          .from("memories")
          .delete()
          .eq("chat_id", chatId)
          .eq("kind", "scene");
        await supabase.from("memories").insert({
          chat_id: chatId,
          kind: "scene",
          content: await encryptText(
            JSON.stringify({
              location: s.location,
              tone: s.tone,
              relationship: s.relationship,
              goal: s.goal,
            }),
            userId,
          ),
          up_to_message_id: upTo,
        });
      }
    }
  } catch (err) {
    console.error("[refresh_scene_state_error]", err);
  }
}
