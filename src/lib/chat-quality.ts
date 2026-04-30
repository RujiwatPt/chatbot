import { generateText } from "ai";
import { model } from "@/lib/openrouter";
import type { Character, SceneState } from "@/lib/memory";
import {
  looksRepetitive,
  validateInCharacterOutput,
} from "@/lib/memory";
import { REWRITE_SYSTEM } from "@/lib/prompts";

export function pickModelId(persona: string, configured: string) {
  const p = persona.toLowerCase();
  const emotionallyComplex =
    p.includes("therap") ||
    p.includes("trauma") ||
    p.includes("grief") ||
    p.includes("deeply") ||
    p.includes("reflect");
  if (emotionallyComplex) return configured || "openai/gpt-oss-120b:free";
  return configured || "deepseek/deepseek-chat-v3.1:free";
}

export async function generateAssistantText(params: {
  character: Character;
  sceneState: SceneState | null;
  system: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  priorAssistant: string[];
}) {
  const { character, sceneState, system, messages, priorAssistant } = params;
  const routedModel = pickModelId(character.persona, character.model);

  let finalText = "";
  const first = await generateText({
    model: model(routedModel),
    system,
    messages,
  });
  finalText = first.text.trim();

  const selfName = character.alias?.trim() || character.name;
  let validation = validateInCharacterOutput({
    output: finalText,
    selfName,
    sceneState,
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
      });
      finalText = rewritten.text.trim();
      validation = validateInCharacterOutput({
        output: finalText,
        selfName,
        sceneState,
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
        await new Promise((r) => setTimeout(r, 30));
      }
      controller.close();
    },
  });
}
