if (typeof window !== "undefined") {
  throw new Error("openrouter.ts is server-only and must never be loaded in the browser.");
}

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  DEFAULT_MODEL as BASE_DEFAULT_MODEL,
  SUMMARIZER_MODEL as BASE_SUMMARIZER_MODEL,
  DEFAULT_FALLBACK_MODELS,
  MODEL_OPTIONS,
  ALLOWED_MODELS,
  INTERNAL_MODELS,
  ALL_ALLOWED_MODELS,
  getModelNickname,
  sanitizeModel,
} from "./models";

export const DEFAULT_MODEL =
  process.env.OPENROUTER_MODEL ?? BASE_DEFAULT_MODEL;

export const SUMMARIZER_MODEL =
  process.env.SUMMARIZER_MODEL ?? BASE_SUMMARIZER_MODEL;

export {
  DEFAULT_FALLBACK_MODELS,
  MODEL_OPTIONS,
  ALLOWED_MODELS,
  INTERNAL_MODELS,
  ALL_ALLOWED_MODELS,
  getModelNickname,
  sanitizeModel,
};

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
    const currentAuth = headers.get("Authorization");
    if (!currentAuth || currentAuth === "Bearer " || currentAuth === "Bearer") {
      headers.set("Authorization", `Bearer ${apiKey}`);
    }
    customInit.headers = headers;
  }

  // Inject anti-repetition parameters for OpenRouter (penalizes prompt & output repetition)
  if (typeof customInit.body === "string" && (customInit.method === "POST" || !customInit.method)) {
    try {
      const parsed = JSON.parse(customInit.body);
      if (parsed && typeof parsed === "object") {
        let modified = false;
        if (parsed.repetition_penalty === undefined) {
          parsed.repetition_penalty = 1.12;
          modified = true;
        }
        if (parsed.min_p === undefined) {
          parsed.min_p = 0.08;
          modified = true;
        }
        if (parsed.model && typeof parsed.model === "string") {
          const primary = parsed.model;
          parsed.models = [
            primary,
            ...DEFAULT_FALLBACK_MODELS.filter((m) => m !== primary),
          ].slice(0, 3);
          modified = true;
        }
        if (modified) {
          customInit.body = JSON.stringify(parsed);
        }
      }
    } catch {
      // Non-JSON body, proceed without modification
    }
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

export function model(id: string | null | undefined, allowInternal = true) {
  return openrouter(sanitizeModel(id, allowInternal));
}
