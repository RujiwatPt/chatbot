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

import {
  cleanRoleplayTropes,
  stripAppearanceTropes,
  extractUsedActionsAndSounds,
  extractRepeatedPhrases,
  extractLastTurnPhrases,
  extractLastTurnRemix,
  looksRepetitive,
  validateInCharacterOutput,
} from "./roleplay-cleaner";

export {
  cleanRoleplayTropes,
  stripAppearanceTropes,
  extractUsedActionsAndSounds,
  extractRepeatedPhrases,
  extractLastTurnPhrases,
  extractLastTurnRemix,
  looksRepetitive,
  validateInCharacterOutput,
};

function formatCharacterDefinition(
  selfName: string,
  character: Character,
  personaOverride?: string,
) {
  const persona = personaOverride ?? character.persona;
  return `<character_definition>
Name: ${selfName}
Persona & Traits:
${persona}
${character.scenario ? `Scenario: ${character.scenario}\n` : ""}${
    character.greeting
      ? `Greeting Anchor / Voice Reference (do not repeat this greeting):\n${character.greeting}\n`
      : ""
  }</character_definition>`;
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
    `You are portraying ${selfName}. Stay in character. Never break into assistant or AI voice.`,
  );
  parts.push(formatCharacterDefinition(selfName, character));

  if (userName || userPronouns || userDescription) {
    parts.push(
      `<user_profile>\n${
        userName ? `Preferred Name: ${userName}\n` : ""
      }${
        userPronouns ? `Pronouns: ${userPronouns}` : ""
      }${
        userDescription ? `\nUser Description / Persona:\n${userDescription}` : ""
      }\n</user_profile>`,
    );
  }

  if (sceneState) {
    parts.push(
      `<scene_state>\nLocation: ${sceneState.location}\nEmotional Tone: ${sceneState.tone}\nRelationship: ${sceneState.relationship}\nCurrent Goal: ${sceneState.goal}\nStay in this location unless the user moves the scene.\n</scene_state>`,
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

  const ruleLines: string[] = [
    `ROLEPLAY GUIDELINES`,
    `- Format: Dialogue in "double quotes", actions and expressions in *asterisks*.`,
    `- Dialogue & Subtext: Let spoken dialogue and physical actions convey emotion. Avoid vocal delivery tags (e.g. do not write 'his voice was low/gravelly/husky with satisfaction'). Let the dialogue carry the tone.`,
    `- Agency: Play only ${selfName}. Never speak, act, decide, or feel for the user.`,
    `- Progression & Continuity: This is an ongoing, interactive roleplay. Advance the scene forward with fresh actions and dialogue. Never conclude the story, summarize future events, or write 'The End'. Always end your turn on an active moment that leaves room for the user to respond.`,
    userName
      ? `- Address the user as "you" or ${userName}.`
      : `- Address the user as "you".`,
    userPronouns
      ? `- If you refer to the user in third person, use ${userPronouns}.`
      : "",
    isRomanticOrNsfw
      ? `- Intimate & Romantic Scenes: One attentive beat of ${selfName}'s action and voice, paced naturally with the user.`
      : `- Tone: Stay grounded in ${selfName}'s authentic personality and mannerisms.`,
  ].filter(Boolean);

  if (feedback && feedback.length > 0) {
    if (feedback.includes("too_verbose")) {
      ruleLines.push(`User preference: stay under ~120 words. Cut extra description.`);
    }
    if (
      feedback.includes("more_in_character") ||
      feedback.includes("too_generic")
    ) {
      ruleLines.push(
        `User preference: stronger ${selfName} voice and specific mannerisms. Avoid generic phrasing.`,
      );
    }
  }

  const rules = ruleLines.join("\n");
  let finalPrompt = [...parts, rules].join("\n\n");

  // Multi-stage fallback prompt budgeting to guarantee system prompt never overflows context limits
  if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS) {
    const trimmedFacts = facts.slice(0, 10);
    let trimmedParts = parts.filter((p) => !p.startsWith("<durable_facts>"));
    if (trimmedFacts.length) {
      trimmedParts.push(
        `<durable_facts>\n${trimmedFacts.map((f) => `- ${f}`).join("\n")}\n</durable_facts>`,
      );
    }
    finalPrompt = [...trimmedParts, rules].join("\n\n");

    if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS && summary) {
      const truncatedSummary = `${summary.slice(0, 1200)}...`;
      trimmedParts = trimmedParts.map((p) =>
        p.startsWith("<narrative_summary>")
          ? `<narrative_summary>\n${truncatedSummary}\n</narrative_summary>`
          : p,
      );
      finalPrompt = [...trimmedParts, rules].join("\n\n");
    }

    if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS && character.persona.length > 800) {
      const trimmedPersona = `${character.persona.slice(0, 800)}...`;
      trimmedParts = trimmedParts.map((p) =>
        p.startsWith("<character_definition>")
          ? formatCharacterDefinition(selfName, character, trimmedPersona)
          : p,
      );
      finalPrompt = [...trimmedParts, rules].join("\n\n");
    }

    if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS) {
      trimmedParts = trimmedParts.filter((p) => !p.startsWith("<narrative_summary>"));
      finalPrompt = [...trimmedParts, rules].join("\n\n");
    }
    if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS) {
      trimmedParts = trimmedParts.filter((p) => !p.startsWith("<durable_facts>"));
      finalPrompt = [...trimmedParts, rules].join("\n\n");
    }
    if (estimateTokens(finalPrompt) > MAX_SYSTEM_TOKENS) {
      trimmedParts = trimmedParts.filter((p) => !p.startsWith("<scene_state>"));
      finalPrompt = [...trimmedParts, rules].join("\n\n");
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
  userId?: string,
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
  const chatQuery = supabase
    .from("chats")
    .select(
      "*, character:characters(name, alias, persona, scenario, greeting, model, tags)",
    )
    .eq("id", chatId);

  const [chatRes, memoryRes, feedbackRes] = await Promise.all([
    (userId ? chatQuery.eq("user_id", userId) : chatQuery).maybeSingle(),
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

  const effectiveUserId = userId ?? (chat?.user_id as string | undefined);
  const userName = (chat?.user_name as string | null) ?? null;
  const userPronouns = (chat?.user_pronouns as string | null) ?? null;
  const userDescription = (chat?.user_description as string | null) ?? null;

  const decryptedMemories = await Promise.all(
    (memoryRows ?? []).map(async (rawM) => ({
      kind: rawM.kind,
      up_to_message_id: rawM.up_to_message_id,
      decryptedContent: effectiveUserId ? await decryptText(rawM.content, effectiveUserId) : rawM.content,
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
      content: effectiveUserId ? await decryptText(m.content, effectiveUserId) : m.content,
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
  try {
    const { text } = await generateText({
      model: model(SUMMARIZER_MODEL),
      system: SUMMARIZER_SYSTEM,
      prompt: userPrompt,
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(6000),
    });
    rawText = text;
    raw = extractJson(text);
  } catch {
    // Fail silently in background
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
      abortSignal: AbortSignal.timeout(5000),
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
