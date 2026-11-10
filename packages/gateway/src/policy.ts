/**
 * policy.ts — Deterministic structural checks for the Decant gateway.
 *
 * Enforces:
 *   - Payload size caps (4KB default for intents/registration, 512KB for agent chat completions)
 *   - Token-bucket rate limits per session ID
 *   - SSRF protection against private, loopback, and cloud metadata endpoints
 */

import type { IncomingMessage, ServerResponse } from "node:http";

const HEADER_SESSION = "x-decant-session";

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/** Per-session buckets keyed by session ID. */
const buckets = new Map<string, TokenBucket>();

export function getMaxPayloadBytes(): number {
  const envVal = process.env["DECANT_MAX_PAYLOAD_BYTES"];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return 4 * 1024; // 4 KB default for metadata & intents
}

export function getMaxChatPayloadBytes(): number {
  const envVal = process.env["DECANT_MAX_CHAT_BODY_BYTES"];
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return 512 * 1024; // 512 KB default for agent chat completions & tool contexts
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

/**
 * SSRF validation: checks if an IP/hostname is a private, loopback, or cloud-metadata address.
 */
export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (host === "localhost" || host === "::1" || host === "0.0.0.0") return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true;
  return false;
}

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
