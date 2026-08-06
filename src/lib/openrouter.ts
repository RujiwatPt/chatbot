import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL ?? "sao10k/l3.3-euryale-70b";

export const SUMMARIZER_MODEL =
  process.env.SUMMARIZER_MODEL ?? "meta-llama/llama-3.3-70b-instruct";

async function getOpenRouterApiKey(): Promise<string> {
  let key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    try {
      const { env } = await getCloudflareContext();
      key = (env as unknown as Record<string, string | undefined>)
        .OPENROUTER_API_KEY;
    } catch {
      // outside Cloudflare context
    }
  }
  return key || "";
}

const openrouterFetch: typeof fetch = async (input, init) => {
  const customInit = { ...init };

  if (!customInit.signal) {
    customInit.signal = AbortSignal.timeout(110000);
  }

  // Ensure Authorization header is present if process.env.OPENROUTER_API_KEY was empty at init
  const apiKey = await getOpenRouterApiKey();
  if (apiKey) {
    const headers = new Headers(customInit.headers || {});
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${apiKey}`);
    }
    customInit.headers = headers;
  }

  return await fetch(input, customInit);
};

export const openrouter = createOpenAICompatible({
  name: "openrouter",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  headers: {
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "",
    "X-Title": process.env.OPENROUTER_APP_NAME ?? "Howly.ai",
  },
  fetch: openrouterFetch,
});

export const MODEL_OPTIONS = [
  {
    id: "sao10k/l3.3-euryale-70b",
    name: "Sao10K: Euryale 70B",
    tag: "Default Roleplay",
    speed: "Standard",
    description: "Rich, immersive prose & deep character adherence.",
  },
  {
    id: "aion-labs/aion-3.0-mini",
    name: "AionLabs: Aion 3.0 Mini",
    tag: "Fast RP",
    speed: "Fast",
    description: "Lightweight, responsive roleplay model.",
  },
  {
    id: "aion-labs/aion-3.0",
    name: "AionLabs: Aion 3.0",
    tag: "Advanced RP",
    speed: "Standard",
    description: "Balanced, immersive conversation & story development.",
  },
  {
    id: "nousresearch/hermes-4-70b",
    name: "Nous: Hermes 4 70B",
    tag: "Reasoning & RP",
    speed: "Standard",
    description: "Advanced reasoning and creative dialogue dynamics.",
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
    id: "anthracite-org/magnum-v4-72b",
    name: "Anthracite: Magnum v4 72B",
    tag: "Deep Creative",
    speed: "Standard",
    description: "High-capability creative writing and roleplay engine.",
  },
  {
    id: "gryphe/mythomax-l2-13b",
    name: "MythoMax 13B",
    tag: "Classic Light",
    speed: "Fast",
    description: "Classic lightweight roleplay model with rapid generation.",
  },
  {
    id: "thedrummer/rocinante-12b",
    name: "TheDrummer: Rocinante 12B",
    tag: "Storytelling",
    speed: "Fast",
    description: "Character-focused narrative storytelling model.",
  },
] as const;

export const ALLOWED_MODELS = new Set<string>(MODEL_OPTIONS.map((m) => m.id));

export function getModelNickname(id: string | null | undefined): string {
  const sanitized = sanitizeModel(id);
  const found = MODEL_OPTIONS.find((m) => m.id === sanitized);
  return found?.name ?? "Sao10K: Euryale 70B";
}

export function sanitizeModel(id: string | null | undefined): string {
  if (id === "venice/uncensored") {
    return "cognitivecomputations/dolphin-mistral-24b-venice-edition";
  }
  if (id && ALLOWED_MODELS.has(id)) {
    return id;
  }
  return DEFAULT_MODEL;
}

export function model(id: string | null | undefined) {
  return openrouter(sanitizeModel(id));
}
