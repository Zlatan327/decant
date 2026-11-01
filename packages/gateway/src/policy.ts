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

  let bucket = buckets.get(sessionId);
  if (!bucket) {
    bucket = { tokens: MAX_TOKENS, lastRefill: now };
    buckets.set(sessionId, bucket);
  }

  // Refill tokens if the window has elapsed
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= REFILL_INTERVAL_MS) {
    bucket.tokens = MAX_TOKENS;
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
 * Payload size guard.
 * Returns `true` if the Content-Length is within bounds; writes 413 otherwise.
 */
export function enforcePayloadSize(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  const lengthHeader = req.headers["content-length"];
  if (lengthHeader) {
    const length = parseInt(lengthHeader, 10);
    if (!Number.isNaN(length) && length > MAX_PAYLOAD_BYTES) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload Too Large — max 4 KB" }));
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
