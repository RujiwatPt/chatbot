import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL ?? "sao10k/l3.3-euryale-70b";

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
    name: "Euryale 70B",
    tag: "Default Roleplay",
    speed: "Standard",
    description: "Rich, immersive prose & deep character adherence.",
  },
  {
    id: "sophosympatheia/midnight-rose-70b",
    name: "Midnight Rose 70B",
    tag: "Sensory Prose",
    speed: "Standard",
    description: "Detailed, evocative storytelling and deep mood.",
  },
  {
    id: "neversleep/llama-3-lumimaid-70b",
    name: "Lumimaid 70B",
    tag: "Creative Roleplay",
    speed: "Standard",
    description: "Expressive dialogue and vibrant character dynamics.",
  },
  {
    id: "gryphe/mythomax-l2-13b",
    name: "MythoMax 13B",
    tag: "Fast & Light",
    speed: "Fast",
    description: "Classic lightweight roleplay model with rapid generation.",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    tag: "Balanced",
    speed: "Standard",
    description: "Strong instruction following & balanced voice.",
  },
] as const;

export const ALLOWED_MODELS = new Set<string>(MODEL_OPTIONS.map((m) => m.id));

export function getModelNickname(id: string | null | undefined): string {
  const sanitized = sanitizeModel(id);
  const found = MODEL_OPTIONS.find((m) => m.id === sanitized);
  return found?.name ?? "Euryale 70B";
}

export function sanitizeModel(id: string | null | undefined): string {
  if (id && ALLOWED_MODELS.has(id)) {
    return id;
  }
  return DEFAULT_MODEL;
}

export function model(id: string | null | undefined) {
  return openrouter(sanitizeModel(id));
}
