import { generateText, streamText } from "ai";
import { model, DEFAULT_FALLBACK_MODELS } from "@/lib/openrouter";
import type { Character, SceneState } from "@/lib/memory";
import {
  looksRepetitive,
  validateInCharacterOutput,
} from "@/lib/memory";
import { REWRITE_SYSTEM } from "@/lib/prompts";

export function pickModelId(configuredModel?: string | null) {
  return configuredModel || "sao10k/l3.1-euryale-70b";
}

/**
 * Realtime token streaming: Begins streaming tokens from OpenRouter immediately,
 * reducing Time-To-First-Token (TTFT) from ~4000ms down to ~300ms.
 */
export async function streamAssistantText(params: {
  character: Character;
  sceneState: SceneState | null;
  system: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  priorAssistant: string[];
  userName?: string | null;
  abortSignal?: AbortSignal;
}) {
  const { character, system, messages, abortSignal } = params;
  const routedModel = pickModelId(character.model);

  const candidateModels = [
    routedModel,
    ...DEFAULT_FALLBACK_MODELS.filter((m) => m !== routedModel),
  ];

  let lastError: unknown = null;
  for (const candidate of candidateModels) {
    try {
      const result = streamText({
        model: model(candidate),
        system,
        messages,
        temperature: 0.85,
        topP: 0.95,
        frequencyPenalty: 0.35,
        presencePenalty: 0.45,
        maxOutputTokens: 450,
        abortSignal: abortSignal || AbortSignal.timeout(110000),
        onError({ error }) {
          console.error(`[streamAssistantText_error on ${candidate}]`, error);
        },
      });

      return {
        stream: result.textStream,
        fullTextPromise: result.text,
        modelId: candidate,
        toTextStreamResponse: (init?: ResponseInit) => result.toTextStreamResponse(init),
      };
    } catch (err) {
      lastError = err;
      console.warn(`[streamAssistantText] Model ${candidate} stream setup failed, trying fallback:`, err);
    }
  }

  throw lastError || new Error("Failed to initialize stream across all candidate models.");
}

export async function generateAssistantText(params: {
  character: Character;
  sceneState: SceneState | null;
  system: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  priorAssistant: string[];
  userName?: string | null;
}) {
  const { character, sceneState, system, messages, priorAssistant, userName } = params;
  const routedModel = pickModelId(character.model);

  const candidateModels = [
    routedModel,
    ...DEFAULT_FALLBACK_MODELS.filter((m) => m !== routedModel),
  ];

  let finalText = "";
  let successfulModelId = routedModel;
  let lastError: unknown = null;

  for (const candidate of candidateModels) {
    try {
      const first = await generateText({
        model: model(candidate),
        system,
        messages,
        temperature: 0.85,
        topP: 0.95,
        frequencyPenalty: 0.35,
        presencePenalty: 0.45,
        maxOutputTokens: 450,
        abortSignal: AbortSignal.timeout(110000),
      });
      finalText = first.text.trim();
      successfulModelId = candidate;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[generateAssistantText] Model ${candidate} failed, trying fallback:`, err);
    }
  }

  if (!finalText) {
    throw lastError || new Error("All candidate models failed to generate response.");
  }

  const selfName = character.alias?.trim() || character.name;
  let validation = validateInCharacterOutput({
    output: finalText,
    selfName,
    sceneState,
    userName,
  });
  const repetitive = looksRepetitive(finalText, priorAssistant);

  if (!validation.ok || repetitive) {
    const rewritePrompt = [
      `Character name: ${selfName}`,
      `Validation issues: ${validation.reasons.join(", ") || "(none)"}`,
      repetitive
        ? "Repetition: this is a synonym remix of a recent turn. Invent a new action, object, and spoken line. Do not swap adverbs or verbs (softly→quietly, chuckle→laugh)."
        : null,
      "",
      "DRAFT RESPONSE:",
      finalText,
      "",
      "Rewrite the response to fix issues while preserving intent and continuity.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const rewritten = await generateText({
        model: model(successfulModelId),
        system: `${REWRITE_SYSTEM}\n\n${system}`,
        prompt: rewritePrompt,
        temperature: 0.88,
        frequencyPenalty: 0.45,
        presencePenalty: 0.45,
        maxOutputTokens: 500,
        abortSignal: AbortSignal.timeout(90000),
      });
      finalText = rewritten.text.trim();
      validation = validateInCharacterOutput({
        output: finalText,
        selfName,
        sceneState,
        userName,
      });
    } catch {
      // Keep original output on rewrite failure.
    }
  }

  return {
    text: finalText,
    modelId: successfulModelId,
    validation,
    repetitive,
  };
}
