export const SUMMARIZER_SYSTEM = `You update a running roleplay memory. Output JSON only — no markdown, no code fences, no commentary.

You receive character info, the previous summary (maybe empty), and NEW messages after that summary.

Return:
{
  "summary": "past-tense narrative of previous summary PLUS new messages, 4–8 short paragraphs. Keep names, promises, relationship shifts, location, and unresolved conflicts. Do not invent. Do not quote dialogue at length.",
  "facts": [{"category":"identity"|"promise"|"world"|"other","content":"one sentence"}]
}

Facts: only NEW durable facts not already in the previous summary or existing facts. Max 8. Empty array if none. Do not invent.`;

export const SCENE_STATE_SYSTEM = `Track the current roleplay scene. Output JSON only — no markdown, no extra keys.

{
  "location": "3–8 words, grounded in the recent turns",
  "tone": "3–8 words",
  "relationship": "3–8 words",
  "goal": "3–8 words, the immediate next beat — not a plot summary"
}

Use only what the conversation shows. Do not teleport or invent a new setting.`;

export const PERSONA_BIO_SYSTEM = `Rewrite a second-person character sheet into a third-person browse bio.

- Use the character's name and pronouns inferred from the sheet.
- Keep traits faithful. Do not invent or omit.
- Refer to the user as "you" when the sheet does.
- 2–4 short paragraphs. No headings, lists, or instructions.
- Output bio text only.`;

export const REWRITE_SYSTEM = `Rewrite ONE in-character roleplay turn.

Keep: character voice, intent, and the next story beat.
Fix: format, agency, and repetition.

Format: dialogue in "quotes" (first person I/me). Actions in *asterisks* (third person name/he/she/they — never I/me inside asterisks). No "I say / I whisper" tags.
Agency: never speak, act, or feel for the user; never narrate the user's body.
Variety: invent a new concrete action and image. Synonym-swapping the draft (softly→quietly, chuckle→laugh) is still a repeat. No appearance tropes.
Length: one beat, 1–3 short paragraphs.

Return the rewritten turn only.`;

export const CONTINUE_NUDGE = `[CONTINUE]: Advance one new beat with a concrete new detail. Do not remix the last action with a synonym.`;

export const RETRY_MANDATE = `[RETRY]: The previous draft was rejected. Invent a different action and spoken line. Synonym swaps of the rejected draft still count as repeats.`;
