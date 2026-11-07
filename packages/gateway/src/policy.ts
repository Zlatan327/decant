/**
 * policy.ts — Deterministic structural checks for the Decant gateway.
 *
 * Phase 1: Session-key authentication only.
 * Phase 2: Adds token-bucket rate limiter and payload size constraints.
 *
 * RULE: No LLM inference, no probabilistic checks — every decision is
 *       a pure function of the request bytes.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

// ─── Phase 1: Session Key Check ────────────────────────────────────────────

const HEADER_SESSION = "x-decant-session";

/**
 * Returns `true` if the request carries a non-empty session key.
 * When it returns `false` it has already written a 401 response.
 */
export function enforceSession(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  const key = req.headers[HEADER_SESSION];
  if (!key || (Array.isArray(key) && key.length === 0)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized — missing X-Decant-Session header" }));
    return false;
  }
  return true;
}

// ─── Phase 2 stubs (wired up in Phase 2) ───────────────────────────────────

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/** Per-session buckets keyed by session ID. */
const buckets = new Map<string, TokenBucket>();

export function getMaxPayloadBytes(): number {
  const envVal = process.env["DECANT_MAX_CHAT_BODY_BYTES"];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return 4 * 1024; // 4 KB default
}

export function getRateLimitMax(): number {
  const envVal = process.env["DECANT_RATE_LIMIT_MAX"];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return 3;
}

export function getRateLimitWindowMs(): number {
  const envVal = process.env["DECANT_RATE_LIMIT_WINDOW_MS"];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return 10_000;
}

const MAX_TOKENS = 3;
const REFILL_INTERVAL_MS = 10_000; // 10 seconds
const MAX_PAYLOAD_BYTES = 4 * 1024; // 4 KB

/**
 * Token-bucket rate limiter.
 * Returns `true` if the request is allowed; writes 429 and returns `false` otherwise.
 */
export function enforceRateLimit(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  const sessionId = req.headers[HEADER_SESSION] as string;
  const now = Date.now();
  const maxTokens = getRateLimitMax();
  const refillInterval = getRateLimitWindowMs();

  let bucket = buckets.get(sessionId);
  if (!bucket) {
    bucket = { tokens: maxTokens, lastRefill: now };
    buckets.set(sessionId, bucket);
  }

  // Refill tokens if the window has elapsed
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= refillInterval) {
    bucket.tokens = maxTokens;
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Too Many Requests — rate limit exceeded" }));
    return false;
  }

  bucket.tokens -= 1;
  return true;
}

/**
 * Distributed rate limiter.
 * If a connected Redis client is supplied, verifies and decrements quota atomically in Redis.
 * Falls back transparently to in-memory token-bucket check.
 */
export async function enforceRateLimitDistributed(
  req: IncomingMessage,
  res: ServerResponse,
  redisClient?: { isConnected: () => boolean; checkRateLimit: (sessionId: string, max: number, windowMs: number) => Promise<{ allowed: boolean }> }
): Promise<boolean> {
  const sessionId = req.headers[HEADER_SESSION] as string;
  if (!sessionId) return true; // Session enforcement handles missing keys

  if (redisClient && redisClient.isConnected()) {
    const maxTokens = getRateLimitMax();
    const refillInterval = getRateLimitWindowMs();
    const result = await redisClient.checkRateLimit(sessionId, maxTokens, refillInterval);
    if (!result.allowed) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too Many Requests — rate limit exceeded" }));
      return false;
    }
    return true;
  }

  return enforceRateLimit(req, res);
}

/**
 * Payload size guard.
 * Returns `true` if the Content-Length is within bounds; writes 413 otherwise.
 */
export function enforcePayloadSize(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number = getMaxPayloadBytes()
): boolean {
  const lengthHeader = req.headers["content-length"];
  if (lengthHeader) {
    const length = parseInt(lengthHeader, 10);
    if (!Number.isNaN(length) && length > maxBytes) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Payload Too Large — max ${maxBytes} bytes` }));
      return false;
    }
  }
  return true;
}

/**
 * Reset all rate-limit buckets — used by tests to get a clean state.
 */
export function resetBuckets(): void {
  buckets.clear();
}
