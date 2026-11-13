export const DEFAULT_HIGH_LOAD_MESSAGE =
  "The model is experiencing some high load, try changing model or wait for a moment before trying again.";

export const CREDITS_DEPLETED_MESSAGE =
  "OpenRouter account credits are depleted. Please top up credits at https://openrouter.ai/settings/credits.";

export const INVALID_API_KEY_MESSAGE =
  "OpenRouter API key is invalid or expired. Please check your API key in settings.";

export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please refresh the page or sign in again.";

export const TIMEOUT_ERROR_MESSAGE =
  "The response took too long and timed out. Please try again or switch to a faster model.";

export const CHALLENGE_ERROR_MESSAGE =
  "Security verification interrupted the request. Please refresh the page and try again.";

/**
 * Returns true when a server response body looks like raw HTML (e.g. Cloudflare 524/1101/403 pages)
 * so raw markup is never surfaced directly in chat UI banners.
 */
export function isHtmlErrorPayload(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("<!doctype") ||
    lower.startsWith("<html") ||
    lower.startsWith("<!--[if") ||
    lower.startsWith("<head") ||
    lower.startsWith("<body")
  ) {
    return true;
  }
  return trimmed.startsWith("<") && /<\/?(html|head|body|title|div|script|meta)\b/i.test(trimmed);
}

function tryExtractJsonError(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error.trim();
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
  } catch {
    // ignore malformed JSON
  }
  return null;
}

/**
 * Normalizes an HTTP error payload + status into a safe, concise user-facing message.
 */
export function sanitizeHttpErrorMessage(
  rawText: string,
  status?: number,
  contentType?: string | null,
  fallback: string = DEFAULT_HIGH_LOAD_MESSAGE,
): string {
  const trimmed = rawText.trim();
  const ct = (contentType ?? "").toLowerCase();

  if (ct.includes("text/html") || isHtmlErrorPayload(trimmed)) {
    if (status === 524 || status === 504 || /\b(524|504)\b|time[- ]?out/i.test(trimmed)) {
      return TIMEOUT_ERROR_MESSAGE;
    }
    if (
      status === 403 ||
      /just a moment|cf-challenge|attention required|access denied/i.test(trimmed)
    ) {
      return CHALLENGE_ERROR_MESSAGE;
    }
    if (status && status >= 500) {
      return DEFAULT_HIGH_LOAD_MESSAGE;
    }
    return fallback;
  }

  const normalized = tryExtractJsonError(trimmed) ?? trimmed;
  const lower = normalized.toLowerCase();

  if (
    status === 401 &&
    (lower === "unauthenticated" || lower === "unauthorized" || lower === "session_expired")
  ) {
    return SESSION_EXPIRED_MESSAGE;
  }
  if (lower.includes("session has expired")) {
    return SESSION_EXPIRED_MESSAGE;
  }

  if (
    status === 402 ||
    lower.includes("credits") ||
    lower.includes("insufficient credits") ||
    /\b402\b/.test(normalized)
  ) {
    return CREDITS_DEPLETED_MESSAGE;
  }

  if (
    status === 401 ||
    lower.includes("api key") ||
    lower.includes("unauthorized") ||
    lower.includes("user not found") ||
    lower.includes("key not found") ||
    lower.includes("auth credentials") ||
    /\b401\b/.test(normalized)
  ) {
    return INVALID_API_KEY_MESSAGE;
  }

  if (status === 524 || status === 504 || lower.includes("timed out") || lower.includes("timeout")) {
    return TIMEOUT_ERROR_MESSAGE;
  }

  if (status === 429 || lower === "too_many_requests" || /\b429\b/.test(normalized)) {
    return "Too many requests right now. Please wait a moment and try again.";
  }

  if (
    (status !== undefined && status >= 500) ||
    lower.includes("high load") ||
    /\b(500|502|503)\b/.test(normalized)
  ) {
    return DEFAULT_HIGH_LOAD_MESSAGE;
  }

  if (!normalized || normalized === "bad_request" || normalized === "not_found") {
    return fallback;
  }

  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

/**
 * Reads an error Response safely and returns a user-facing Error message.
 */
export async function readApiErrorMessage(
  res: Response,
  fallback: string = DEFAULT_HIGH_LOAD_MESSAGE,
): Promise<string> {
  const rawText = await res.text().catch(() => "");
  return sanitizeHttpErrorMessage(
    rawText,
    res.status,
    res.headers.get("content-type"),
    fallback,
  );
}

/**
 * Formats caught client-side errors into safe user-facing banner messages.
 */
export function formatChatError(
  err: unknown,
  fallback: string = DEFAULT_HIGH_LOAD_MESSAGE,
): string {
  const rawMsg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return sanitizeHttpErrorMessage(rawMsg, undefined, undefined, fallback);
}

/**
 * Maps an upstream LLM/provider error on the server into a clean plain-text HTTP Response.
 */
export function mapLlmErrorToResponse(err: unknown): Response {
  const errMsg = err instanceof Error ? err.message : String(err);
  if (errMsg.includes("Insufficient credits") || /\b402\b/.test(errMsg)) {
    return new Response(CREDITS_DEPLETED_MESSAGE, { status: 402 });
  }
  if (
    /\b401\b/.test(errMsg) ||
    errMsg.includes("Unauthorized") ||
    errMsg.includes("User not found") ||
    errMsg.includes("Key not found") ||
    errMsg.includes("auth credentials")
  ) {
    return new Response(INVALID_API_KEY_MESSAGE, { status: 401 });
  }
  if (
    err instanceof DOMException && err.name === "TimeoutError" ||
    /timeout|timed out|abort/i.test(errMsg)
  ) {
    return new Response(TIMEOUT_ERROR_MESSAGE, { status: 504 });
  }
  return new Response(DEFAULT_HIGH_LOAD_MESSAGE, { status: 503 });
}
