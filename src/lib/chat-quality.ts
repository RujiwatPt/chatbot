import { generateText, streamText } from "ai";
import { model } from "@/lib/openrouter";
import type { Character, SceneState } from "@/lib/memory";
import {
  looksRepetitive,
  validateInCharacterOutput,
} from "@/lib/memory";
import { REWRITE_SYSTEM } from "@/lib/prompts";

export function pickModelId(persona: string, configured: string) {
  return configured || "sao10k/l3.3-euryale-70b";
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
}) {
  const { character, system, messages } = params;
  const routedModel = pickModelId(character.persona, character.model);

  const result = streamText({
    model: model(routedModel),
    system,
    messages,
    temperature: 0.8,
    frequencyPenalty: 0.15,
    maxOutputTokens: 600,
    abortSignal: AbortSignal.timeout(60000),
  });

  return {
    stream: result.textStream,
    fullTextPromise: result.text,
    modelId: routedModel,
  };
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
  const routedModel = pickModelId(character.persona, character.model);

  let finalText = "";
  const first = await generateText({
    model: model(routedModel),
    system,
    messages,
    temperature: 0.8,
    frequencyPenalty: 0.15,
    maxOutputTokens: 600,
    abortSignal: AbortSignal.timeout(60000),
  });
  finalText = first.text.trim();

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
      repetitive ? "Repetition: detected against recent assistant turns." : null,
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
        model: model(routedModel),
        system: `${REWRITE_SYSTEM}\n\n${system}`,
        prompt: rewritePrompt,
        temperature: 0.7,
        frequencyPenalty: 0.15,
        maxOutputTokens: 600,
        abortSignal: AbortSignal.timeout(45000),
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
    modelId: routedModel,
    validation,
    repetitive,
  };
}

export function toSmoothWordStream(text: string) {
  const parts = text.split(/(\s+)/).filter(Boolean);
  return new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      for (const part of parts) {
        controller.enqueue(enc.encode(part));
        await new Promise((r) => setTimeout(r, 12));
      }
      controller.close();
    },
  });
}
