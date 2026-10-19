/**
 * proxy.ts — Low-latency streaming proxy for the Decant gateway.
 *
 * Phase 1: Forward authorised requests to a public endpoint (httpbin.org).
 * Phase 2: Enforce rate limiting and payload size constraints before forwarding.
 * Phase 3: Replace hardcoded session auth with on-chain NEAR contract view calls.
 *
 * Runs on port 8080 by default (override with PORT env var).
 */

import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import { enforceSession, enforceRateLimit, enforcePayloadSize } from "./policy.js";
import { NearRpcClient } from "./near-rpc.js";

// ─── Configuration ──────────────────────────────────────────────────────────

const PORT = parseInt(process.env["PORT"] ?? "8080", 10);

/**
 * The upstream target.  httpbin.org is a free, public HTTP echo service
 * that requires zero API keys — perfect for Phase 1 wire validation.
 */
const UPSTREAM_HOST = process.env["UPSTREAM_HOST"] ?? "httpbin.org";
const UPSTREAM_PORT = parseInt(process.env["UPSTREAM_PORT"] ?? "443", 10);
const UPSTREAM_HTTPS = (process.env["UPSTREAM_HTTPS"] ?? "true") === "true";

// Whether to enable Phase 2 rate-limiting policies (off by default in Phase 1).
const ENABLE_RATE_LIMIT = (process.env["ENABLE_RATE_LIMIT"] ?? "false") === "true";

// Phase 3: Whether to enable on-chain NEAR quota verification.
// When enabled, the gateway checks the NEAR contract for session registration
// and remaining balance instead of just checking header presence.
const ENABLE_NEAR_AUTH = (process.env["ENABLE_NEAR_AUTH"] ?? "false") === "true";

// Cost in compute tokens per proxied request (deducted from on-chain quota).
const TOKENS_PER_REQUEST = parseInt(process.env["TOKENS_PER_REQUEST"] ?? "1", 10);

const nearRpc = ENABLE_NEAR_AUTH ? new NearRpcClient() : null;

// ─── Proxy handler ──────────────────────────────────────────────────────────

async function handleRequest(clientReq: IncomingMessage, clientRes: ServerResponse): Promise<void> {
  // Phase 1 gate: session key header must be present
  if (!enforceSession(clientReq, clientRes)) return;

  const sessionId = clientReq.headers["x-decant-session"] as string;

  // Phase 3 gate: verify session on-chain if NEAR auth is enabled
  if (ENABLE_NEAR_AUTH && nearRpc) {
    try {
      const quota = await nearRpc.getQuota(sessionId);

      if (!quota) {
        clientRes.writeHead(401, { "Content-Type": "application/json" });
        clientRes.end(JSON.stringify({
          error: "Unauthorized — session not registered on-chain",
          session_id: sessionId,
        }));
        return;
      }

      if (quota.remaining < TOKENS_PER_REQUEST) {
        clientRes.writeHead(402, { "Content-Type": "application/json" });
        clientRes.end(JSON.stringify({
          error: "Payment Required — insufficient on-chain quota",
          session_id: sessionId,
          remaining: quota.remaining,
          required: TOKENS_PER_REQUEST,
        }));
        return;
      }

      // Attach quota info to response headers for transparency
      clientRes.setHeader("X-Decant-Quota-Remaining", quota.remaining.toString());
      clientRes.setHeader("X-Decant-Quota-Total", quota.total.toString());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown NEAR RPC error";
      console.error("[proxy] NEAR RPC error:", message);
      clientRes.writeHead(503, { "Content-Type": "application/json" });
      clientRes.end(JSON.stringify({
        error: "Service Unavailable — cannot verify on-chain quota",
        detail: message,
      }));
      return;
    }
  }

  // Phase 2 gates (only when explicitly enabled)
  if (ENABLE_RATE_LIMIT) {
    if (!enforcePayloadSize(clientReq, clientRes)) return;
    if (!enforceRateLimit(clientReq, clientRes)) return;
  }

  // Build the upstream request
  const upstreamPath = clientReq.url ?? "/get";
  const doRequest = UPSTREAM_HTTPS ? httpsRequest : httpRequest;

  const proxyReq = doRequest(
    {
      hostname: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      path: upstreamPath,
      method: clientReq.method,
      headers: {
        host: UPSTREAM_HOST,
        "user-agent": "decant-gateway/0.1",
        accept: clientReq.headers["accept"] ?? "application/json",
      },
    },
    (proxyRes) => {
      // Stream the upstream response back to the client
      clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    }
  );

  proxyReq.on("error", (err) => {
    console.error("[proxy] upstream error:", err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { "Content-Type": "application/json" });
    }
    clientRes.end(JSON.stringify({ error: "Bad Gateway", detail: err.message }));
  });

  // Pipe the client body to upstream (for POST, PUT, etc.)
  clientReq.pipe(proxyReq, { end: true });
}

// ─── Server lifecycle ───────────────────────────────────────────────────────

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error("[proxy] unhandled error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ error: "Internal Server Error" }));
  });
});

server.listen(PORT, () => {
  console.log(`[decant-gateway] listening on http://localhost:${PORT}`);
  console.log(`[decant-gateway] upstream → ${UPSTREAM_HTTPS ? "https" : "http"}://${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
  if (ENABLE_RATE_LIMIT) {
    console.log(`[decant-gateway] rate limiting ENABLED`);
  }
  if (ENABLE_NEAR_AUTH) {
    console.log(`[decant-gateway] NEAR on-chain auth ENABLED`);
    console.log(`[decant-gateway] contract → ${process.env["NEAR_CONTRACT_ID"] ?? "decant.test.near"}`);
    console.log(`[decant-gateway] RPC      → ${process.env["NEAR_RPC_URL"] ?? "http://127.0.0.1:3030"}`);
  }
});

/** Exported for programmatic use in tests. */
export { server, PORT };
export default server;
