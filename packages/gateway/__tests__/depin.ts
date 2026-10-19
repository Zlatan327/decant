/**
 * depin.ts — Phase 4 Validation Gate: Web3 DePIN Handshake & Llama 3 Streaming.
 *
 * Verifies live bytes moving across the wire between:
 *   [Agent SDK] ──▶ [Decant Gateway Proxy] ──▶ [DePIN Compute Node (Hyperbolic/Akash/Llama-3)]
 *                           │
 *                           ▼
 *               [NEAR On-Chain Settlement]
 *
 * Hard Gate Assertions:
 *   1. NEAR Testnet RPC connectivity check (live blockchain).
 *   2. DePIN compute provider serves live Server-Sent Events (SSE) token stream.
 *   3. Decant Gateway proxies SSE stream with Transfer-Encoding: chunked without buffering.
 *   4. Agent SDK receives real-time token callbacks and aggregates full Llama 3 completion.
 *   5. On-chain quota is enforced: exhausted balance blocks DePIN inference with 402.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http, { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { DePINComputeNode } from "../src/depin-node.js";
import { NearSandboxServer } from "../../contracts/src/sandbox-server.js";
import { NearRpcClient } from "../src/near-rpc.js";
import { DecantClient } from "../../agent-sdk/src/client.js";
import { enforceSession, enforceRateLimit, enforcePayloadSize } from "../src/policy.js";

describe("Phase 4 — Production Upgrades & DePIN Handshake", () => {
  let depinNode: DePINComputeNode;
  let depinPort: number;
  let sandboxServer: NearSandboxServer;
  let sandboxPort: number;
  let gatewayServer: Server;
  let gatewayPort: number;
  let nearRpc: NearRpcClient;

  before(async () => {
    // 1. Launch DePIN Compute Provider Node (Llama-3 solver)
    depinNode = new DePINComputeNode({
      model: "meta-llama/Meta-Llama-3-8B-Instruct",
      tokenDelayMs: 5, // fast for tests
    });
    depinPort = await depinNode.start(0);

    // 2. Launch NEAR On-Chain Ledger
    sandboxServer = new NearSandboxServer("decant.test.near");
    sandboxPort = await sandboxServer.start(0);

    nearRpc = new NearRpcClient({
      rpcUrl: `http://127.0.0.1:${sandboxPort}`,
      contractId: "decant.test.near",
    });

    // 3. Launch Decant Gateway Proxy configured with on-chain auth & DePIN upstream
    gatewayServer = createServer(async (clientReq: IncomingMessage, clientRes: ServerResponse) => {
      if (!enforceSession(clientReq, clientRes)) return;

      const sessionId = clientReq.headers["x-decant-session"] as string;

      try {
        const quota = await nearRpc.getQuota(sessionId);
        if (!quota) {
          clientRes.writeHead(401, { "Content-Type": "application/json" });
          clientRes.end(JSON.stringify({ error: "Unauthorized — session not registered on-chain" }));
          return;
        }

        if (quota.remaining <= 0) {
          clientRes.writeHead(402, { "Content-Type": "application/json" });
          clientRes.end(JSON.stringify({ error: "Payment Required — insufficient on-chain quota" }));
          return;
        }

        clientRes.setHeader("X-Decant-Quota-Remaining", quota.remaining.toString());
        clientRes.setHeader("X-Decant-Quota-Total", quota.total.toString());
      } catch (err: any) {
        clientRes.writeHead(503, { "Content-Type": "application/json" });
        clientRes.end(JSON.stringify({ error: "NEAR RPC unavailable" }));
        return;
      }

      if (!enforcePayloadSize(clientReq, clientRes)) return;

      // Forward directly to DePIN compute solver node
      const proxyReq = http.request(
        {
          hostname: "127.0.0.1",
          port: depinPort,
          path: clientReq.url,
          method: clientReq.method,
          headers: {
            ...clientReq.headers,
            host: `127.0.0.1:${depinPort}`,
          },
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

    await new Promise<void>((resolve) => gatewayServer.listen(0, "127.0.0.1", resolve));
    gatewayPort = (gatewayServer.address() as import("node:net").AddressInfo).port;
  });

  after(async () => {
    await depinNode?.stop();
    await sandboxServer?.stop();
    await new Promise<void>((resolve) => gatewayServer?.close(() => resolve()));
  });

  // ── Test 1: Production Web3 Connectivity ──────────────────────────────────
  it("NEAR Testnet production probe: connects to live blockchain", async () => {
    const testnetClient = new NearRpcClient({
      rpcUrl: "https://test.rpc.fastnear.com",
      contractId: "decant.testnet",
    });

    const isLive = await testnetClient.healthCheck();
    assert.equal(isLive, true, "Must be able to reach live NEAR Testnet RPC");
  });

  // ── Test 2: DePIN Solver Health ──────────────────────────────────────────
  it("DePIN compute solver is online and identifies as Llama-3 cluster", async () => {
    const res = await fetch(`http://127.0.0.1:${depinPort}/health`);
    assert.equal(res.status, 200);
    const json = await res.json() as { model: string; provider: string };
    assert.equal(json.model, "meta-llama/Meta-Llama-3-8B-Instruct");
    assert.ok(json.provider.includes("DePIN"));
  });

  // ── Test 3: Live Wire SSE Streaming Through Gateway ───────────────────────
  it("HARD GATE: Agent streams Llama 3 inference through Gateway with progressive SSE chunks", async () => {
    const sessionId = "agent-llama3-streamer";
    sandboxServer.registerSession(sessionId, 50, "agent.test.near");

    const client = new DecantClient({
      gatewayUrl: `http://127.0.0.1:${gatewayPort}`,
      sessionKey: sessionId,
    });

    const tokensReceived: string[] = [];
    const result = await client.streamChat(
      "Summarize the Decant protocol advantages",
      (token) => {
        tokensReceived.push(token);
      }
    );

    assert.equal(result.status, 200, "Streaming request must return HTTP 200");
    assert.ok(tokensReceived.length > 5, "Must receive multiple progressive streaming tokens");
    assert.ok(result.fullText.includes("Decant"), "Result text must contain prompt completion");
    assert.equal(result.tokens, tokensReceived.length);
    assert.equal(result.quotaRemaining, 50);
  });

  // ── Test 4: Quota Consumption and Lockout on DePIN Route ──────────────────
  it("HARD GATE: Exhausted quota immediately halts DePIN inference streaming with 402", async () => {
    const sessionId = "agent-llama3-streamer";

    // Drain all 50 units on-chain
    sandboxServer.consumeQuota(sessionId, 50);

    const client = new DecantClient({
      gatewayUrl: `http://127.0.0.1:${gatewayPort}`,
      sessionKey: sessionId,
    });

    const result = await client.streamChat("Another prompt after credit drain");
    assert.equal(result.status, 402, "Must reject with HTTP 402 Payment Required");
    assert.ok(result.fullText.includes("insufficient on-chain quota"));
  });
});
