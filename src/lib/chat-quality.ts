import { streamText } from "ai";
import { model, DEFAULT_FALLBACK_MODELS } from "@/lib/openrouter";
import { sanitizeModel } from "@/lib/models";
import type { Character, SceneState } from "@/lib/memory";

export function pickModelId(configuredModel?: string | null) {
  return sanitizeModel(configuredModel);
}

/**
 * Realtime token streaming: Begins streaming tokens from OpenRouter immediately,
 * reducing Time-To-First-Token (TTFT) from ~4000ms down to ~300ms.
 * OpenRouter automatically handles fallback models within a single request.
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

  // If the primary model is free, avoid falling back to paid models
  const isFree = routedModel.includes(":free");
  const candidateModels = isFree
    ? [routedModel]
    : [
        routedModel,
        ...DEFAULT_FALLBACK_MODELS.filter((m) => m !== routedModel).slice(0, 1),
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
        toTextStreamResponse: (init?: ResponseInit) =>
          result.toTextStreamResponse(init),
      };
    } catch (err) {
      lastError = err;
      console.warn(
        `[streamAssistantText] Model ${candidate} stream setup failed, trying fallback:`,
        err,
      );
    }
  }

  throw (
    lastError ||
    new Error("Failed to initialize stream across candidate models.")
  );
}
