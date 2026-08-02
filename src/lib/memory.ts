import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { model } from "@/lib/openrouter";
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
};

export type SceneState = {
  location: string;
  tone: string;
  relationship: string;
  goal: string;
};

// How many recent messages we leave un-summarized at the tail when the
// summarizer runs. Below this many post-summary messages, we don't summarize.
export const RECENT_WINDOW = 30;

// Hard cap on messages sent verbatim in a turn. Leverages high-context 70B models.
const POST_SUMMARY_CAP = 100;

// Re-summarize when there are at least this many messages past the recent
// window since the last summary (i.e. older than the tail-N we keep verbatim).
const SUMMARIZE_MIN_NEW = 10;

export function buildSystemPrompt(opts: {
  character: Character;
  facts: string[];
  sceneState: SceneState | null;
  summary: string | null;
  feedback?: string[];
  userName?: string | null;
  userPronouns?: string | null;
}) {
  const { character, facts, sceneState, summary, feedback } = opts;
  const selfName = character.alias?.trim() || character.name;
  const userName = opts.userName?.trim() || "";
  const userPronouns = opts.userPronouns?.trim() || "";
  const parts: string[] = [];

  parts.push(
    `[ROLEPLAY MODE: Active]\nYou are portraying ${selfName} in an ongoing immersive roleplay scenario. Maintain high engagement, emotional resonance, and strict character adherence.`,
  );

  parts.push(
    `<character_definition>\nName: ${selfName}\nPersona & Traits:\n${character.persona}\n${
      character.scenario ? `Scenario: ${character.scenario}\n` : ""
    }${
      character.greeting
        ? `Greeting Anchor / Voice Reference:\n*${character.greeting}*\n`
        : ""
    }</character_definition>`,
  );

  if (userName || userPronouns) {
    parts.push(
      `<user_profile>\nThe person you are roleplaying with${
        userName ? ` is named ${userName}` : ""
      }.${
        userPronouns ? ` Use ${userPronouns} pronouns when referring to them.` : ""
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

  const directives: string[] = [
    `RESPONSE CONTRACT:`,
    `- Stay 100% in character as ${selfName} at all times. Never output AI disclaimers or assistant phrases.`,
    `- Write evocative, sensory-rich prose. Describe actions, body language, facial expressions, and inner feelings.`,
    `- Format narration/actions in *asterisks* and spoken dialogue in plain text.`,
    `- Never break the fourth wall unless explicitly asked out-of-character by the user.`,
    `- Voice split (STRICT RULE):`,
    `  - SPOKEN DIALOGUE (outside asterisks): MUST ALWAYS be in first-person ("I", "me", "my", "mine", "myself"). NEVER refer to yourself using your own name (${selfName}) or third-person pronouns ("he", "him", "his", "she", "her", "they") in spoken quotes (e.g. say "I love having you close", NEVER "${selfName} loves having you close" or "Just him and you").`,
    `  - ACTION NARRATION (inside *asterisks*): MUST ALWAYS be in third-person — use ${selfName}'s name or he/she/they pronouns (e.g. *${selfName} smiles and holds you close* or *he wraps his arms around you*).`,
    `  - NEVER use first-person ("I/me") inside *action narration*, and NEVER use third-person pronouns or character name inside spoken dialogue.`,
    userName
      ? `- Name disambiguation rule: ${selfName} is the character's own name, not ${userName}'s. Address the human as ${userName} or "you"; never call them ${selfName}.`
      : `- Name disambiguation rule: ${selfName} is the character's own name, not the user's name. Address the user as "you" unless the user explicitly provides their name.`,
  ];

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

  parts.push(directives.join("\n"));
  return parts.join("\n\n");
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
} | null> {
  const { data: chat } = await supabase
    .from("chats")
    .select(
      "user_id, user_name, user_pronouns, character:characters(name, alias, persona, scenario, greeting, model)",
    )
    .eq("id", chatId)
    .maybeSingle();

  const character = (
    Array.isArray(chat?.character) ? chat?.character[0] : chat?.character
  ) as Character | undefined;
  if (!character) return null;

  const userId = chat?.user_id as string | undefined;
  const userName = (chat?.user_name as string | null) ?? null;
  const userPronouns = (chat?.user_pronouns as string | null) ?? null;

  // Memories first — we need the summary's coverage to know which messages
  // to send verbatim.
  const { data: memoryRows } = await supabase
    .from("memories")
    .select("kind, content, id, up_to_message_id")
    .eq("chat_id", chatId)
    .order("id", { ascending: false });

  const facts: string[] = [];
  let sceneState: SceneState | null = null;
  let summary: string | null = null;
  let summaryUpTo = 0;
  for (const rawM of memoryRows ?? []) {
    const decryptedContent = userId ? await decryptText(rawM.content, userId) : rawM.content;
    if (rawM.kind === "fact") {
      facts.push(decryptedContent);
    } else if (rawM.kind === "scene" && sceneState === null) {
      try {
        const parsed = JSON.parse(decryptedContent) as Partial<SceneState>;
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
      summary = decryptedContent;
      summaryUpTo = (rawM.up_to_message_id as number | null) ?? 0;
    }
  }

  // Fetch recent user feedback for this chat to tune response style
  const { data: feedbackRows } = await supabase
    .from("message_feedback")
    .select("feedback")
    .eq("chat_id", chatId)
    .order("id", { ascending: false })
    .limit(10);
  const feedback = Array.from(
    new Set((feedbackRows ?? []).map((f) => f.feedback as string)),
  );

  // Send all messages newer than the summary's coverage, taking the MOST RECENT
  // messages up to POST_SUMMARY_CAP and reversing to chronological order.
  const { data: messages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .gt("id", summaryUpTo)
    .order("id", { ascending: false })
    .limit(POST_SUMMARY_CAP);

  const recent = await Promise.all(
    ((messages ?? []).reverse()).map(async (m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: userId ? await decryptText(m.content, userId) : m.content,
    })),
  );

  // Prioritize durable fact categories and deduplicate/cap to top 30 to preserve context budget
  const uniqueFacts = Array.from(new Set(facts));
  const rank = (fact: string) => {
    if (fact.startsWith("[identity]")) return 0;
    if (fact.startsWith("[promise]")) return 1;
    if (fact.startsWith("[world]")) return 2;
    return 3;
  };
  uniqueFacts.sort((a, b) => rank(a) - rank(b));
  const cappedFacts = uniqueFacts.slice(0, 30);

  return {
    character,
    recent,
    facts: cappedFacts,
    sceneState,
    summary,
    feedback,
    userName,
    userPronouns,
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
  for (const prev of priorAssistant.slice(-3)) {
    const p = prev.toLowerCase().replace(/\s+/g, " ").trim();
    if (!p) continue;
    if (normalized === p) return true;
    if (normalized.includes(p) && p.length > 80) return true;
    const a = new Set(normalized.split(" "));
    const b = new Set(p.split(" "));
    const inter = [...a].filter((x) => b.has(x)).length;
    const union = new Set([...a, ...b]).size;
    if (union > 0 && inter / union > 0.82) return true;
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

  // 2. Spoken dialogue (text outside *asterisks*) must stay first-person (no third-person self-references)
  const dialogueOnly = text.replace(/\*[^*]*\*/g, " ").trim();
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
): Promise<void> {
  const { data: chat } = await supabase
    .from("chats")
    .select("user_id")
    .eq("id", chatId)
    .maybeSingle();
  if (!chat?.user_id) return;
  const userId = chat.user_id;

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

  // We summarize messages OLDER than the recent window. Find the cutoff.
  const { data: recentEdge } = await supabase
    .from("messages")
    .select("id")
    .eq("chat_id", chatId)
    .order("id", { ascending: false })
    .limit(RECENT_WINDOW);
  if (!recentEdge || recentEdge.length < RECENT_WINDOW) return;
  const oldestRecentId = recentEdge[recentEdge.length - 1].id as number;

  // Messages eligible to fold in: id < oldestRecentId AND id > sinceId
  const { data: toFold } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("chat_id", chatId)
    .gt("id", sinceId)
    .lt("id", oldestRecentId)
    .order("id", { ascending: true });
  if (!toFold) return;

  if (toFold.length < SUMMARIZE_MIN_NEW) return;

  const upTo = toFold[toFold.length - 1].id as number;

  const decryptedPrior = prior?.content ? await decryptText(prior.content, userId) : null;
  const transcript = (
    await Promise.all(
      toFold.map(async (m) => `${m.role.toUpperCase()}: ${await decryptText(m.content, userId)}`),
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
        model: model(character.model),
        system: SUMMARIZER_SYSTEM,
        prompt: userPrompt,
      });
      rawText = text;
      raw = extractJson(text);
    } catch (err) {
      console.warn("[summarizer] generation failed", {
        chatId,
        model: character.model,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempts >= 2) return;
    }
  }
  if (!raw || typeof raw !== "object") {
    console.warn("[summarizer] could not parse JSON from model output", {
      chatId,
      model: character.model,
      preview: rawText.slice(0, 200),
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

  if (!summaryText) {
    console.warn("[summarizer] empty summary in parsed output", {
      chatId,
      model: character.model,
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
    content: await encryptText(summaryText, userId),
    up_to_message_id: upTo,
  });

  if (factsList.length) {
    const encryptedFacts = await Promise.all(
      factsList.map(async (content) => ({
        chat_id: chatId,
        kind: "fact",
        content: await encryptText(content, userId),
        up_to_message_id: upTo,
      })),
    );
    await supabase.from("memories").insert(encryptedFacts);
  }

  // Refresh scene state from the most recent chat turns (actual current scene)
  const { data: currentSceneMessages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("id", { ascending: false })
    .limit(10);

  const tail = (
    await Promise.all(
      ((currentSceneMessages ?? []).reverse()).map(
        async (m) => `${m.role}: ${await decryptText(m.content, userId)}`,
      ),
    )
  ).join("\n");

  try {
    const { text } = await generateText({
      model: model(character.model),
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
  } catch {
    // best effort only
  }
}
