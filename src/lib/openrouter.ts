import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-chat-v3.1:free";

// Fallback chain. OpenRouter accepts a `models` array in the request body
// and tries each in order if the primary errors or is unavailable. The
// primary model is always prepended at request time.
const DEFAULT_FALLBACKS = [
  "inclusionai/ling-2.6-1t:free",
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
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
  if (
    init?.body &&
    typeof init.body === "string" &&
    typeof input === "string" &&
    input.includes("/chat/completions")
  ) {
    try {
      const body = JSON.parse(init.body);
      if (typeof body?.model === "string" && !body.models) {
        // OpenRouter caps `models` at 3 entries (primary + up to 2 fallbacks).
        const chain = [
          body.model,
          ...FALLBACK_MODELS.filter((m) => m !== body.model),
        ].slice(0, 3);
        body.models = chain;
        chainUsed = chain;
        init = { ...init, body: JSON.stringify(body) };
      }
    } catch {
      // not JSON we recognize — pass through
    }
  }
  const res = await fetch(input, init);
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
