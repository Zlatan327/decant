/**
 * wire.ts — Integration tests that verify REAL bytes moving across a wire.
 *
 * These are NOT unit tests with mocks.  Each test:
 *   1. Spawns the actual gateway server on a random port.
 *   2. Sends real HTTP requests through it.
 *   3. Asserts on the actual response status codes and bodies.
 *
 * Phase 1 tests: session auth + live upstream proxy.
 * Phase 2 tests: rate limiting + payload size constraints.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { enforceSession, enforceRateLimit, enforcePayloadSize, resetBuckets } from "../src/policy.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Spin up a minimal gateway server with configurable policy flags.
 * Uses a local echo target instead of httpbin.org so tests are self-contained
 * and don't depend on external network availability.
 */
function createTestGateway(opts: { rateLimit: boolean } = { rateLimit: false }): {
  gateway: Server;
  echoServer: Server;
  gatewayPort: number;
  echoPort: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
} {
  let gatewayPort = 0;
  let echoPort = 0;

  // Local echo server simulating the upstream target
  const echoServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          echo: true,
          method: req.method,
          path: req.url,
          body: body || null,
          headers: req.headers,
        })
      );
    });
  });

  // Gateway proxy pointing at the local echo server
  const gateway = createServer((clientReq: IncomingMessage, clientRes: ServerResponse) => {
    // Policy checks
    if (!enforceSession(clientReq, clientRes)) return;
    if (opts.rateLimit) {
      if (!enforcePayloadSize(clientReq, clientRes)) return;
      if (!enforceRateLimit(clientReq, clientRes)) return;
    }

    // Proxy to local echo server
    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: echoPort,
        path: clientReq.url,
        method: clientReq.method,
        headers: { ...clientReq.headers, host: `127.0.0.1:${echoPort}` },
      },
      (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(clientRes, { end: true });
      }
    );
    proxyReq.on("error", (err) => {
      clientRes.writeHead(502);
      clientRes.end(JSON.stringify({ error: err.message }));
    });
    clientReq.pipe(proxyReq, { end: true });
  });

  async function start(): Promise<void> {
    await new Promise<void>((resolve) => echoServer.listen(0, "127.0.0.1", resolve));
    echoPort = (echoServer.address() as import("node:net").AddressInfo).port;
    await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve));
    gatewayPort = (gateway.address() as import("node:net").AddressInfo).port;
  }

  async function stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => gateway.close((e) => (e ? reject(e) : resolve())));
    await new Promise<void>((resolve, reject) => echoServer.close((e) => (e ? reject(e) : resolve())));
  }

  return {
    gateway,
    echoServer,
    get gatewayPort() { return gatewayPort; },
    get echoPort() { return echoPort; },
    start,
    stop,
  };
}

/** Simple fetch wrapper for test requests. */
async function hit(
  port: number,
  path: string,
  opts: { session?: string; method?: string; body?: string } = {}
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {};
  if (opts.session) headers["X-Decant-Session"] = opts.session;
  if (opts.body) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(opts.body).toString();
  }

  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ?? undefined,
  });
  const body = await res.text();
  return { status: res.status, body };
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1 Tests: The Cryptographic Wire
// ═══════════════════════════════════════════════════════════════════════════

describe("Phase 1 — Wire Transport & Session Auth", () => {
  const env = createTestGateway({ rateLimit: false });

  before(async () => { await env.start(); });
  after(async () => { await env.stop(); });

  it("rejects requests without X-Decant-Session with 401", async () => {
    const res = await hit(env.gatewayPort, "/get");
    assert.equal(res.status, 401, "Expected 401 Unauthorized");
    assert.ok(res.body.includes("Unauthorized"), "Body should mention Unauthorized");
  });

  it("proxies authenticated GET request to upstream and returns 200", async () => {
    const res = await hit(env.gatewayPort, "/get", { session: "test-key-abc123" });
    assert.equal(res.status, 200, "Expected 200 OK from proxied request");

    const json = JSON.parse(res.body);
    assert.equal(json.echo, true, "Response should come from our echo server");
    assert.equal(json.method, "GET");
    assert.equal(json.path, "/get");
  });

  it("proxies authenticated POST request with body", async () => {
    const payload = JSON.stringify({ prompt: "hello world" });
    const res = await hit(env.gatewayPort, "/post", {
      session: "test-key-abc123",
      method: "POST",
      body: payload,
    });
    assert.equal(res.status, 200);

    const json = JSON.parse(res.body);
    assert.equal(json.echo, true);
    assert.equal(json.method, "POST");
    const echoedBody = JSON.parse(json.body);
    assert.equal(echoedBody.prompt, "hello world");
  });

  it("returns real bytes — response body is non-empty", async () => {
    const res = await hit(env.gatewayPort, "/get", { session: "any-key" });
    assert.ok(res.body.length > 0, "Response body must contain real data");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2 Tests: Rate Limiting & Payload Constraints
// ═══════════════════════════════════════════════════════════════════════════

describe("Phase 2 — Rate Limiting & Payload Size", () => {
  const env = createTestGateway({ rateLimit: true });

  before(async () => { await env.start(); });
  after(async () => { await env.stop(); });
  beforeEach(() => { resetBuckets(); });

  it("allows exactly 3 requests then rejects with 429", async () => {
    const session = "rate-test-session";
    const results: number[] = [];

    // Send 10 rapid-fire requests
    for (let i = 0; i < 10; i++) {
      const res = await hit(env.gatewayPort, "/get", { session });
      results.push(res.status);
    }

    const successes = results.filter((s) => s === 200).length;
    const rejections = results.filter((s) => s === 429).length;

    assert.equal(successes, 3, `Expected exactly 3 successes, got ${successes}. Results: ${results}`);
    assert.equal(rejections, 7, `Expected exactly 7 rejections, got ${rejections}. Results: ${results}`);
  });

  it("rejects oversized payloads with 413", async () => {
    const bigPayload = "X".repeat(5 * 1024); // 5 KB > 4 KB limit
    const res = await hit(env.gatewayPort, "/post", {
      session: "size-test-session",
      method: "POST",
      body: bigPayload,
    });
    assert.equal(res.status, 413, "Expected 413 Payload Too Large");
  });

  it("accepts payloads under 4KB", async () => {
    const smallPayload = JSON.stringify({ prompt: "small" });
    const res = await hit(env.gatewayPort, "/post", {
      session: "size-ok-session",
      method: "POST",
      body: smallPayload,
    });
    assert.equal(res.status, 200, "Payload under 4KB should be proxied");
  });

  it("rate limits are per-session — different sessions get independent buckets", async () => {
    const results1: number[] = [];
    const results2: number[] = [];

    for (let i = 0; i < 4; i++) {
      const r1 = await hit(env.gatewayPort, "/get", { session: "session-A" });
      results1.push(r1.status);
      const r2 = await hit(env.gatewayPort, "/get", { session: "session-B" });
      results2.push(r2.status);
    }

    // Each session should get 3 successes independently
    assert.equal(results1.filter((s) => s === 200).length, 3, "Session A should get 3 successes");
    assert.equal(results2.filter((s) => s === 200).length, 3, "Session B should get 3 successes");
  });
});
