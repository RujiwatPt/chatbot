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
