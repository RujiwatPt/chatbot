export const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

export const SUMMARIZER_MODEL = "google/gemma-4-26b-a4b-it:free";

export const DEFAULT_FALLBACK_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3.5-lightning:free",
  "openrouter/free",
] as const;

export const MODEL_OPTIONS = [
  {
    id: "google/gemma-4-31b-it:free",
    name: "Google: Gemma 4 31B",
    tag: "Default Free RP",
    speed: "Fast",
    description: "Google DeepMind 31B dense model. Rich prose, character adherence & 256k context (100% Free).",
  },
  {
    id: "google/gemma-4-26b-a4b-it:free",
    name: "Google: Gemma 4 26B MoE",
    tag: "Ultra-Fast",
    speed: "Fast",
    description: "Google DeepMind lightweight MoE. Rapid response times & snappy dialogue (100% Free).",
  },
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "NVIDIA: Nemotron 3 Ultra",
    tag: "Frontier MoE",
    speed: "Standard",
    description: "Massive 550B MoE frontier model. Deep narrative depth and complex reasoning (100% Free).",
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    name: "NVIDIA: Nemotron Lightning",
    tag: "Fast Narrative",
    speed: "Fast",
    description: "High-throughput 30B MoE with 1M context for immersive storytelling (100% Free).",
  },
  {
    id: "thinkingmachines/inkling:free",
    name: "Thinking Machines: Inkling",
    tag: "Deep Creative",
    speed: "Standard",
    description: "High-parameter 975B MoE for imaginative worldbuilding & dynamic interaction (100% Free).",
  },
  {
    id: "thinkingmachines/inkling-small:free",
    name: "Thinking Machines: Inkling Small",
    tag: "Story RP",
    speed: "Fast",
    description: "276B MoE with 1M context. Smooth conversational pacing and expressive dialogue (100% Free).",
  },
  {
    id: "dots-studio/dots-3-note-preview:free",
    name: "Dots Studio: Dots3 Note",
    tag: "Atmospheric",
    speed: "Fast",
    description: "280B MoE with 512k context. Character consistency and atmospheric prose (100% Free).",
  },
  {
    id: "xingchen-agi/xing4.0-29b-a4b:free",
    name: "TeleAI: Xing4.0 29B",
    tag: "Conversational",
    speed: "Fast",
    description: "Balanced 29B MoE language model for expressive, grounded dialogue (100% Free).",
  },
  {
    id: "recursive/flint-v1.0:free",
    name: "Recursive: Flint 40B",
    tag: "Adaptive",
    speed: "Fast",
    description: "Efficient 40B MoE model tuned for adaptive conversation and dialogue (100% Free).",
  },
  {
    id: "openrouter/free",
    name: "OpenRouter: Free Router",
    tag: "Auto-Failover",
    speed: "Fast",
    description: "Dynamic router that automatically connects to the highest-availability active free model (100% Free).",
  },
] as const;

export const ALLOWED_MODELS = new Set<string>(MODEL_OPTIONS.map((m) => m.id));

export const INTERNAL_MODELS = new Set<string>([
  SUMMARIZER_MODEL,
]);

export const ALL_ALLOWED_MODELS = new Set<string>([
  ...ALLOWED_MODELS,
  ...INTERNAL_MODELS,
]);

export function getModelNickname(id: string | null | undefined): string {
  const sanitized = sanitizeModel(id);
  const found = MODEL_OPTIONS.find((m) => m.id === sanitized);
  return found?.name ?? "Google: Gemma 4 31B (Free)";
}

export function sanitizeModel(
  id: string | null | undefined,
  allowInternal = false,
): string {
  if (
    id === "sao10k/l3.1-euryale-70b" ||
    id === "sao10k/l3.3-euryale-70b" ||
    id === "venice/uncensored" ||
    id === "cognitivecomputations/dolphin-mistral-24b-venice-edition" ||
    id === "aion-labs/aion-3.5" ||
    id === "aion-labs/aion-3.0" ||
    id === "aion-labs/aion-2.0"
  ) {
    return "google/gemma-4-31b-it:free";
  }

  if (
    id === "aion-labs/aion-3.5-mini" ||
    id === "aion-labs/aion-3.0-mini" ||
    id === "aion-labs/aion-2.0-mini" ||
    id === "thedrummer/unslopnemo-12b" ||
    id === "gryphe/mythomax-l2-13b" ||
    id === "meta-llama/llama-3.3-70b-instruct"
  ) {
    return "google/gemma-4-26b-a4b-it:free";
  }

  if (
    id === "anthracite-org/magnum-v4-72b" ||
    id === "nousresearch/hermes-3-llama-3.1-70b" ||
    id === "nousresearch/hermes-4-70b"
  ) {
    return "nvidia/nemotron-3-ultra-550b-a55b:free";
  }

  if (
    id === "thedrummer/cydonia-24b-v4.1" ||
    id === "thedrummer/rocinante-12b"
  ) {
    return "thinkingmachines/inkling-small:free";
  }

  if (id === "thedrummer/skyfall-36b-v2") {
    return "dots-studio/dots-3-note-preview:free";
  }

  const allowed = allowInternal ? ALL_ALLOWED_MODELS : ALLOWED_MODELS;
  if (id && allowed.has(id)) {
    return id;
  }
  return DEFAULT_MODEL;
}
