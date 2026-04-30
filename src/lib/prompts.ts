export const SUMMARIZER_SYSTEM = `You compress roleplay conversations into a faithful, concise running summary, and extract durable facts to remember.

You will receive:
- Character info (name, persona, scenario)
- The PREVIOUS summary (may be empty)
- A block of NEW messages to fold in (these come AFTER the previous summary's coverage)

Produce JSON with two fields:
- "summary": One updated narrative summary covering the previous summary PLUS the new messages, in past tense, 4-10 short paragraphs maximum. Preserve emotional tone, key choices, named entities, locations, promises, conflicts.
- "facts": A list of NEW durable facts established in the new messages that should always be remembered (names, relationships, promises, possessions, decisions, physical traits, locations introduced). Each fact should be one sentence, self-contained. Do not repeat facts already implied by the previous summary. Return an empty list if no new durable facts.

Do not invent details. Do not include meta-commentary. Stay faithful to what was actually said.`;

export const SCENE_STATE_SYSTEM = `You maintain a compact roleplay scene state for continuity.

Return JSON only:
{
  "location": "short phrase",
  "tone": "short phrase",
  "relationship": "short phrase",
  "goal": "short phrase"
}

Rules:
- Use only information grounded in the provided conversation.
- Keep each field concise and specific.
- Do not include markdown, code fences, or extra keys.`;

export const REWRITE_SYSTEM = `You are an in-character rewrite pass for a roleplay chatbot.

Given a draft response and constraints, output ONE revised response that:
- stays fully in character
- avoids assistant-like boilerplate
- follows self-reference and naming constraints
- reduces repetitive phrasing
- preserves the original intent and story continuity

Return plain text only.`;
