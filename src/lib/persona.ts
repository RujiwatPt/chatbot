import { generateText } from "ai";
import { model } from "@/lib/openrouter";
import { PERSONA_BIO_SYSTEM } from "@/lib/prompts";

// Turn a second-person persona ("You are Aiko… You speak…") into a friendly
// third-person bio for the character browse/detail pages. Best-effort: returns
// null on any failure so callers can fall back to the raw persona.
export async function generatePersonaBio(input: {
  name: string;
  persona: string;
  scenario?: string | null;
  model?: string | null;
}): Promise<string | null> {
  const prompt = [
    `Name: ${input.name}`,
    input.scenario ? `Scenario: ${input.scenario}` : null,
    "",
    "SECOND-PERSON CHARACTER DESCRIPTION:",
    input.persona,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { text } = await generateText({
      model: model(input.model),
      system: PERSONA_BIO_SYSTEM,
      prompt,
      temperature: 0.4,
    });
    const bio = text.trim();
    return bio.length > 0 ? bio : null;
  } catch {
    return null;
  }
}

export function getCleanPersonaDisplay(
  personaDisplay: string | null | undefined,
  persona: string,
): string {
  if (personaDisplay && personaDisplay.trim().length > 0) {
    return personaDisplay.trim();
  }

  if (!persona || typeof persona !== "string") return "";

  const lines = persona
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      const lower = l.toLowerCase();
      if (lower.startsWith("[roleplay mode") || lower.startsWith("[story progression")) return false;
      if (lower.startsWith("response contract:") || lower.includes("character_definition>")) return false;
      if (lower.startsWith("<character") || lower.startsWith("</character")) return false;
      if (lower.startsWith("name:") || lower.startsWith("persona & traits:")) return false;
      if (lower.startsWith("greeting anchor") || lower.startsWith("scenario:")) return false;
      if (lower.includes("voice & narration") || lower.includes("direct speech")) return false;
      if (lower.includes("output formatting") || lower.includes("turn length")) return false;
      if (lower.includes("you are portraying") || lower.includes("strict requirement")) return false;
      if (lower.startsWith("- stay 100%") || lower.startsWith("- write evocative") || lower.startsWith("- avoid clichés")) return false;
      if (lower.startsWith("- format narration") || lower.startsWith("- never break") || lower.startsWith("- anti-repetition")) return false;
      if (lower.includes("example (correct)") || lower.includes("example (forbidden)")) return false;
      return true;
    });

  const cleaned = lines.join(" ").trim();
  if (cleaned.length > 0) {
    return cleaned;
  }

  return persona.slice(0, 200).trim();
}
