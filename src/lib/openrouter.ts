import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

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

const FALLBACK_MODELS = (
  process.env.OPENROUTER_FALLBACK_MODELS
    ? process.env.OPENROUTER_FALLBACK_MODELS.split(",").map((s) => s.trim())
    : DEFAULT_FALLBACKS
).filter(Boolean);

// Inject the fallback chain into every chat-completions request so the
// upstream API tries each model in order if the primary fails.
const openrouterFetch: typeof fetch = async (input, init) => {
  let chainUsed: string[] | null = null;
  let customInit = { ...init };

  if (!customInit.signal) {
    customInit.signal = AbortSignal.timeout(50000);
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
    "X-Title": process.env.OPENROUTER_APP_NAME ?? "Roleplay Chatbot",
  },
  fetch: openrouterFetch,
});

export function model(id: string | null | undefined) {
  return openrouter(id || DEFAULT_MODEL);
}
