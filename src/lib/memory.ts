import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { model } from "@/lib/openrouter";
import { SCENE_STATE_SYSTEM, SUMMARIZER_SYSTEM } from "@/lib/prompts";

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
export const RECENT_WINDOW = 20;

// Hard cap on messages sent verbatim in a turn. Protects prompt size if the
// summarizer is failing repeatedly (rate limits, model errors).
const POST_SUMMARY_CAP = 60;

// Re-summarize when there are at least this many messages past the recent
// window since the last summary (i.e. older than the tail-N we keep verbatim).
const SUMMARIZE_MIN_NEW = 10;

export function buildSystemPrompt(opts: {
  character: Character;
  facts: string[];
  sceneState: SceneState | null;
  summary: string | null;
}) {
  const { character, facts, sceneState, summary } = opts;
  const selfName = character.alias?.trim() || character.name;
  const parts: string[] = [];
  parts.push(`You are roleplaying as ${selfName}.`);
  parts.push(
    `RESPONSE CONTRACT:\n- Stay fully in character for every line.\n- Write vivid but concise prose (about 2-6 short paragraphs unless the user asks for more).\n- Prefer concrete sensory/action details over generic filler.\n- Do not sound like a generic AI assistant.`,
  );
  parts.push(character.persona);
  if (character.scenario) {
    parts.push(`Scenario: ${character.scenario}`);
  }
  if (sceneState) {
    parts.push(
      `SCENE STATE:\n- Location: ${sceneState.location}\n- Tone: ${sceneState.tone}\n- Relationship: ${sceneState.relationship}\n- Immediate goal: ${sceneState.goal}`,
    );
  }
  if (facts.length) {
    parts.push(
      `KNOWN FACTS (always true, do not contradict):\n${facts
        .map((f) => `- ${f}`)
        .join("\n")}`,
    );
  }
  if (summary) {
    parts.push(`PRIOR EVENTS (summary of earlier roleplay):\n${summary}`);
  }
  parts.push(
    "Stay fully in character. Write evocative, natural prose. Do not break the fourth wall unless the user explicitly asks an out-of-character question.",
  );
  parts.push(
    `Self-reference rule: never use first-person pronouns for the character (no "I", "me", "my", "mine", "myself"). Refer to ${selfName} by name instead, including in actions and dialogue narration.`,
  );
  parts.push(
    `Name disambiguation rule: ${selfName} is the character's own name, not the user's name. Do not call the user "${selfName}". Address the user as "you" unless the user explicitly provides their own name.`,
  );
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
} | null> {
  const { data: chat } = await supabase
    .from("chats")
    .select("character:characters(name, alias, persona, scenario, greeting, model)")
    .eq("id", chatId)
    .maybeSingle();

  const character = (
    Array.isArray(chat?.character) ? chat?.character[0] : chat?.character
  ) as Character | undefined;
  if (!character) return null;

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
  for (const m of memoryRows ?? []) {
    if (m.kind === "fact") {
      facts.push(m.content);
    } else if (m.kind === "scene" && sceneState === null) {
      try {
        const parsed = JSON.parse(m.content) as Partial<SceneState>;
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
    } else if (m.kind === "summary" && summary === null) {
      summary = m.content;
      summaryUpTo = (m.up_to_message_id as number | null) ?? 0;
    }
  }

  // Send all messages newer than the summary's coverage. With no summary,
  // that's the entire chat. Capped to keep prompts bounded.
  const { data: messages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .gt("id", summaryUpTo)
    .order("id", { ascending: true })
    .limit(POST_SUMMARY_CAP);

  const recent = (messages ?? []) as ChatMessage[];

  // Prioritize durable fact categories if present.
  const rank = (fact: string) => {
    if (fact.startsWith("[identity]")) return 0;
    if (fact.startsWith("[promise]")) return 1;
    if (fact.startsWith("[world]")) return 2;
    return 3;
  };
  facts.sort((a, b) => rank(a) - rank(b));

  return { character, recent, facts, sceneState, summary };
}

function extractJson(text: string): unknown | null {
  // Free models sometimes wrap JSON in ```json fences or add prose. Find the
  // outermost {...} and try to parse.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
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
}): { ok: boolean; reasons: string[] } {
  const { output, selfName, sceneState } = params;
  const text = output.trim();
  const reasons: string[] = [];
  if (!text) reasons.push("empty");

  if (/\b(I|me|my|mine|myself)\b/i.test(text)) {
    reasons.push("first_person_self_reference");
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

  const transcript = toFold
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const userPrompt = [
    `Character: ${character.name}`,
    `Persona: ${character.persona}`,
    character.scenario ? `Scenario: ${character.scenario}` : null,
    "",
    `PREVIOUS SUMMARY:\n${prior?.content?.trim() || "(none yet)"}`,
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
    content: summaryText,
    up_to_message_id: upTo,
  });

  if (factsList.length) {
    await supabase.from("memories").insert(
      factsList.map((content) => ({
        chat_id: chatId,
        kind: "fact",
        content,
        up_to_message_id: upTo,
      })),
    );
  }

  // Refresh scene state from the recent transcript tail.
  const tail = toFold
    .slice(-10)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
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
          content: JSON.stringify({
            location: s.location,
            tone: s.tone,
            relationship: s.relationship,
            goal: s.goal,
          }),
          up_to_message_id: upTo,
        });
      }
    }
  } catch {
    // best effort only
  }
}
