import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL ?? "sao10k/l3.3-euryale-70b";

// Fallback chain. OpenRouter accepts a `models` array in the request body
// and tries each in order if the primary errors or is unavailable. OpenRouter
// caps `models` at 3 entries total (primary + up to 2 fallbacks).
const DEFAULT_FALLBACKS = [
  "sophosympatheia/midnight-rose-70b",
  "neversleep/llama-3-lumimaid-70b",
  "gryphe/mythomax-l2-13b",
];

export const FALLBACK_MODELS = (
  process.env.OPENROUTER_FALLBACK_MODELS
    ? process.env.OPENROUTER_FALLBACK_MODELS.split(",").map((s) => s.trim())
    : DEFAULT_FALLBACKS
).filter(Boolean);

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

// Inject the fallback chain into every chat-completions request so the
// upstream API tries each model in order if the primary fails.
const openrouterFetch: typeof fetch = async (input, init) => {
  let chainUsed: string[] | null = null;
  const customInit = { ...init };

  if (!customInit.signal) {
    customInit.signal = AbortSignal.timeout(50000);
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

  if (
    customInit?.body &&
    typeof customInit.body === "string" &&
    typeof input === "string" &&
    input.includes("/chat/completions")
  ) {
    try {
      const body = JSON.parse(customInit.body);
      if (typeof body?.model === "string" && !body.models) {
        // OpenRouter API caps `models` at 3 items total (primary + up to 2 fallbacks).
        const chain = [
          body.model,
          ...FALLBACK_MODELS.filter((m) => m !== body.model),
        ].slice(0, 3);
        body.models = chain;
        chainUsed = chain;
        customInit.body = JSON.stringify(body);
      }
    } catch {
      // not JSON we recognize — pass through
    }
  }
  const res = await fetch(input, customInit);
  if (chainUsed) {
    console.log("[openrouter_fallback_chain]", {
      models: chainUsed,
      status: res.status,
    });
  }
  return res;
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
    id: "google/gemini-2.5-flash",
    name: "Gemini Flash",
    tag: "Ultra Fast",
    speed: "Blazing Fast",
    description: "Lightning-speed streaming & instant responses.",
  },
  {
    id: "gryphe/mythomax-l2-13b",
    name: "MythoMax 13B",
    tag: "Fast & Light",
    speed: "Fast",
    description: "Classic lightweight roleplay model with rapid generation.",
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
    id: "anthropic/claude-3.5-haiku",
    name: "Claude Haiku",
    tag: "Smart & Fast",
    speed: "Fast",
    description: "Intelligent, concise, and quick response turnarounds.",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    name: "Llama 3.3 70B",
    tag: "Balanced",
    speed: "Standard",
    description: "Strong instruction following & balanced voice.",
  },
  {
    id: "deepseek/deepseek-r1-distill-llama-70b",
    name: "DeepSeek R1 70B",
    tag: "Nuanced",
    speed: "Standard",
    description: "Deep reasoning & nuanced emotional depth.",
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
