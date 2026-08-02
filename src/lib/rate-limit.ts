import type { NextRequest } from "next/server";

type RateLimitRecord = {
  timestamps: number[];
};

// In-memory sliding window cache. Keyed by namespace + identifier (IP or User ID).
const tracker = new Map<string, RateLimitRecord>();

// Cleanup expired entries periodically (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpired(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, record] of tracker.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);
    if (record.timestamps.length === 0) {
      tracker.delete(key);
    }
  }
}

export function getClientIp(req: Request | NextRequest): string {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    if (first) return first.trim();
  }

  return "127.0.0.1";
}

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
};

export function checkRateLimit(opts: {
  identifier: string;
  namespace?: string;
  limit: number;
  windowSeconds: number;
}): RateLimitResult {
  const { identifier, namespace = "global", limit, windowSeconds } = opts;
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const key = `${namespace}:${identifier}`;

  cleanupExpired(windowMs);

  let record = tracker.get(key);
  if (!record) {
    record = { timestamps: [] };
    tracker.set(key, record);
  }

  // Filter timestamps within the current sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0];
    const resetMs = oldest + windowMs - now;
    const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));
    return {
      success: false,
      limit,
      remaining: 0,
      resetSeconds,
    };
  }

  record.timestamps.push(now);
  const remaining = Math.max(0, limit - record.timestamps.length);

  return {
    success: true,
    limit,
    remaining,
    resetSeconds: windowSeconds,
  };
}

export function rateLimitResponse(resetSeconds: number): Response {
  return new Response("too_many_requests", {
    status: 429,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": String(resetSeconds),
      "X-RateLimit-Reset": String(resetSeconds),
    },
  });
}
