export const DEFAULT_MODEL = "sao10k/l3.1-euryale-70b";

export const SUMMARIZER_MODEL = "meta-llama/llama-3.3-70b-instruct";

export const DEFAULT_FALLBACK_MODELS = [
  "sao10k/l3.1-euryale-70b",
  "anthracite-org/magnum-v4-72b",
  "aion-labs/aion-3.5",
  "meta-llama/llama-3.3-70b-instruct",
] as const;

export const MODEL_OPTIONS = [
  {
    id: "sao10k/l3.1-euryale-70b",
    name: "Sao10K: Euryale 70B",
    tag: "Default Roleplay",
    speed: "Standard",
    description: "Rich, immersive prose & deep character adherence.",
  },
  {
    id: "google/gemma-4-31b-it:free",
    name: "Google: Gemma 4 31B",
    tag: "100% Free",
    speed: "Fast",
    description: "Google DeepMind 31B dense model. Works even with $0 account balance.",
  },
  {
    id: "aion-labs/aion-3.5-mini",
    name: "AionLabs: Aion 3.5 Mini",
    tag: "Fast RP",
    speed: "Fast",
    description: "Latest lightweight, ultra-responsive roleplay model with 256k context.",
  },
  {
    id: "aion-labs/aion-3.5",
    name: "AionLabs: Aion 3.5",
    tag: "Advanced RP",
    speed: "Standard",
    description: "Latest balanced, immersive dialogue & story development.",
  },
  {
    id: "anthracite-org/magnum-v4-72b",
    name: "Anthracite: Magnum v4 72B",
    tag: "Deep Creative",
    speed: "Standard",
    description: "High-capability creative writing and roleplay engine.",
  },
  {
    id: "thedrummer/cydonia-24b-v4.1",
    name: "TheDrummer: Cydonia 24B",
    tag: "Storytelling",
    speed: "Fast",
    description: "Character-focused creative roleplay and rich dialogue model.",
  },
  {
    id: "thedrummer/skyfall-36b-v2",
    name: "TheDrummer: Skyfall 36B",
    tag: "Narrative RP",
    speed: "Fast",
    description: "Multi-genre atmospheric storytelling and creative immersion.",
  },
  {
    id: "cognitivecomputations/dolphin-mistral-24b-venice-edition",
    name: "Dolphin Mistral 24B",
    tag: "Venice Uncensored",
    speed: "Fast",
    description: "Venice edition uncensored storytelling model.",
  },
  {
    id: "thedrummer/unslopnemo-12b",
    name: "TheDrummer: UnslopNemo 12B",
    tag: "Anti-Cliché",
    speed: "Fast",
    description: "Trained to avoid repetitive tropes and cliché AI phrasing.",
  },
  {
    id: "nousresearch/hermes-3-llama-3.1-70b",
    name: "Nous: Hermes 3 70B",
    tag: "Reasoning & RP",
    speed: "Standard",
    description: "Advanced reasoning and creative dialogue dynamics.",
  },
  {
    id: "gryphe/mythomax-l2-13b",
    name: "MythoMax 13B",
    tag: "Classic Light",
    speed: "Fast",
    description: "Classic lightweight roleplay model with rapid generation.",
  },
] as const;

export const ALLOWED_MODELS = new Set<string>(MODEL_OPTIONS.map((m) => m.id));

export const INTERNAL_MODELS = new Set<string>([
  "meta-llama/llama-3.3-70b-instruct",
  SUMMARIZER_MODEL,
]);

export const ALL_ALLOWED_MODELS = new Set<string>([
  ...ALLOWED_MODELS,
  ...INTERNAL_MODELS,
]);

export function getModelNickname(id: string | null | undefined): string {
  const sanitized = sanitizeModel(id);
  const found = MODEL_OPTIONS.find((m) => m.id === sanitized);
  return found?.name ?? "Sao10K: Euryale 70B";
}

export function sanitizeModel(
  id: string | null | undefined,
  allowInternal = false,
): string {
  if (id === "venice/uncensored") {
    return "cognitivecomputations/dolphin-mistral-24b-venice-edition";
  }
  if (id === "sao10k/l3.3-euryale-70b") {
    return "sao10k/l3.1-euryale-70b";
  }
  if (id === "aion-labs/aion-3.0-mini" || id === "aion-labs/aion-2.0-mini") {
    return "aion-labs/aion-3.5-mini";
  }
  if (id === "aion-labs/aion-3.0" || id === "aion-labs/aion-2.0") {
    return "aion-labs/aion-3.5";
  }
  if (id === "nousresearch/hermes-4-70b") {
    return "nousresearch/hermes-3-llama-3.1-70b";
  }
  if (id === "thedrummer/rocinante-12b") {
    return "thedrummer/cydonia-24b-v4.1";
  }
  const allowed = allowInternal ? ALL_ALLOWED_MODELS : ALLOWED_MODELS;
  if (id && allowed.has(id)) {
    return id;
  }
  return DEFAULT_MODEL;
}
