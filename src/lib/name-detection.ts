const NAME_INTRO_PATTERN =
  /(?:^|[.!?]\s*|\b(?:hi|hello|hey|greetings),?\s*)(?:my name is|i am called|i go by|you can call me|please call me)\s+([A-Za-z0-9_\-']{2,30})\b/i;

const CALL_ME_PATTERN =
  /\bcall me\s+([A-Za-z0-9_\-']{2,30})\b/i;

const DISALLOWED_NAMES = new Set([
  "a", "an", "the", "so", "just", "really", "here", "there", "now", "later",
  "when", "if", "after", "before", "while", "tonight", "tomorrow", "back", "up",
  "down", "on", "at", "by", "in", "again", "maybe", "please", "sir", "ma'am",
  "babe", "baby", "honey", "darling", "sweetheart", "sweetie", "friend", "buddy",
  "crazy", "stupid", "dumb", "idiot", "fool", "names", "that", "it", "something",
  "anything", "nothing", "someone", "anyone", "everyone", "nobody"
]);

export function detectPreferredName(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Reject negative sentences ("don't call me", "never call me", etc.)
  if (/\b(?:don't|do\s+not|never|stop|quit|not)\s+call\s+me\b/i.test(trimmed)) {
    return null;
  }

  // 1. Try explicit introductions first ("my name is X", "you can call me X")
  const introMatch = trimmed.match(NAME_INTRO_PATTERN);
  if (introMatch?.[1]) {
    const candidate = introMatch[1].trim();
    if (!DISALLOWED_NAMES.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // 2. Try "call me X" with strict boundary and non-preposition check
  const callMatch = trimmed.match(CALL_ME_PATTERN);
  if (callMatch?.[1]) {
    const candidate = callMatch[1].trim();
    const lower = candidate.toLowerCase();
    if (DISALLOWED_NAMES.has(lower)) return null;

    // Check next word after candidate: if followed by preposition/conjunction, it's not a name
    const afterMatch = trimmed.slice(trimmed.indexOf(candidate) + candidate.length).trim();
    const firstNextWord = afterMatch.split(/\s+/)[0]?.toLowerCase().replace(/[^\w]/g, "");
    if (firstNextWord && ["when", "if", "later", "tonight", "tomorrow", "after", "before", "on", "at"].includes(firstNextWord)) {
      return null;
    }

    return candidate;
  }

  return null;
}
