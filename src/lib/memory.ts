import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { model } from "@/lib/openrouter";
import { SUMMARIZER_SYSTEM } from "@/lib/prompts";

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type Character = {
  name: string;
  persona: string;
  scenario: string | null;
  greeting: string | null;
  model: string;
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
  summary: string | null;
}) {
  const { character, facts, summary } = opts;
  const parts: string[] = [];
  parts.push(`You are roleplaying as ${character.name}.`);
  parts.push(character.persona);
  if (character.scenario) {
    parts.push(`Scenario: ${character.scenario}`);
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
  return parts.join("\n\n");
}

export async function loadChatContext(
  supabase: SupabaseClient,
  chatId: string,
): Promise<{
  character: Character;
  recent: ChatMessage[];
  facts: string[];
  summary: string | null;
} | null> {
  const { data: chat } = await supabase
    .from("chats")
    .select("character:characters(name, persona, scenario, greeting, model)")
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
  let summary: string | null = null;
  let summaryUpTo = 0;
  for (const m of memoryRows ?? []) {
    if (m.kind === "fact") facts.push(m.content);
    else if (m.kind === "summary" && summary === null) {
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

  return { character, recent, facts, summary };
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
    'Respond with only a JSON object: {"summary": "...", "facts": ["..."]}',
  ]
    .filter(Boolean)
    .join("\n");

  let rawText = "";
  let raw: unknown = null;
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
    return; // free-tier rate limit etc — try again next turn
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
        .filter((f): f is string => typeof f === "string")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];

  if (!summaryText) {
    console.warn("[summarizer] empty summary in parsed output", {
      chatId,
      model: character.model,
    });
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
}
