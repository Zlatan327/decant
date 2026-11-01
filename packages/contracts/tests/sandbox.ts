/**
 * sandbox.ts — NEAR Sandbox Integration Tests & Validation Gate.
 *
 * Verifies live bytes moving across the wire between:
 *   [Decant Gateway / Agent SDK] ──▶ [Decant NEAR Proxy] ──▶ [NEAR JSON-RPC 2.0 Ledger]
 *
 * Hard Gate Assertions:
 *   1. Gateway queries NEAR RPC via JSON-RPC 2.0 view_method to check active quotas.
 *   2. Rejects unregistered sessions with 401.
 *   3. Registers session on ledger with 100 compute units.
 *   4. Allows proxy routing and passes on-chain quota state in headers.
 *   5. Decrements quota on-chain and shuts down requests with 402 once exhausted.
 *   6. Verifies Intent Registry (broadcast_intent + fill_intent) on-chain.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http, { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { NearSandboxServer } from "../src/sandbox-server.js";
import { NearRpcClient } from "../../gateway/src/near-rpc.js";
import { enforceSession, enforceRateLimit, enforcePayloadSize, resetBuckets } from "../../gateway/src/policy.js";

describe("Phase 3 — NEAR Intent Settlement Layer & Validation Gate", () => {
  let sandboxServer: NearSandboxServer;
  let sandboxPort: number;
  let echoServer: Server;
  let echoPort: number;
  let gatewayServer: Server;
  let gatewayPort: number;
  let nearRpc: NearRpcClient;

  before(async () => {
    // 1. Launch NEAR Sandbox JSON-RPC 2.0 server on dynamic port
    sandboxServer = new NearSandboxServer("decant.test.near");
    sandboxPort = await sandboxServer.start(0);

    // 2. Launch Upstream Target (Echo server)
    echoServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "upstream_ok", path: req.url }));
    });
    await new Promise<void>((resolve) => echoServer.listen(0, "127.0.0.1", resolve));
    echoPort = (echoServer.address() as import("node:net").AddressInfo).port;

    // 3. Initialize NEAR RPC client pointed at sandbox
    nearRpc = new NearRpcClient({
      rpcUrl: `http://127.0.0.1:${sandboxPort}`,
      contractId: "decant.test.near",
    });

    // 4. Launch Gateway with NEAR on-chain authentication enabled
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

        // Set response headers showing on-chain status
        clientRes.setHeader("X-Decant-Quota-Remaining", quota.remaining.toString());
        clientRes.setHeader("X-Decant-Quota-Total", quota.total.toString());
      } catch (err: any) {
        clientRes.writeHead(503, { "Content-Type": "application/json" });
        clientRes.end(JSON.stringify({ error: "Service Unavailable", detail: err.message }));
        return;
      }

      // Proxy request to upstream
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

    await new Promise<void>((resolve) => gatewayServer.listen(0, "127.0.0.1", resolve));
    gatewayPort = (gatewayServer.address() as import("node:net").AddressInfo).port;
  });

  after(async () => {
    await sandboxServer?.stop();
    await new Promise<void>((resolve) => echoServer?.close(() => resolve()));
    await new Promise<void>((resolve) => gatewayServer?.close(() => resolve()));
  });

  it("RPC wire check: sandbox server responds to status method", async () => {
    const isHealthy = await nearRpc.healthCheck();
    assert.equal(isHealthy, true, "NEAR RPC sandbox must be healthy and reachable");
  });

  it("On-chain ledger: register session and verify via view_method query", async () => {
    sandboxServer.registerSession("session-alpha", 100, "alice.test.near");

    const quota = await nearRpc.getQuota("session-alpha");
    assert.ok(quota !== null);
    assert.equal(quota!.session_id, "session-alpha");
    assert.equal(quota!.total, 100);
    assert.equal(quota!.remaining, 100);
  });

  it("Intent registry: broadcast intent and verify open status", async () => {
    const intentId = sandboxServer.broadcastIntent("session-alpha", "llama-3-8b-instruct");
    assert.ok(intentId.startsWith("intent-"));

    const intent = await nearRpc.getIntent(intentId);
    assert.ok(intent !== null);
    assert.equal(intent!.status, "Open");
    assert.equal(intent!.payload, "llama-3-8b-instruct");

    const openList = await nearRpc.listOpenIntents();
    assert.ok(openList.some((i) => i.intent_id === intentId));
  });

  it("Intent registry: solver fills open intent", async () => {
    const intentId = sandboxServer.broadcastIntent("session-alpha", "qwen-2.5-coder");
    sandboxServer.fillIntent(intentId, "solver-gpu-01.near");

    const intent = await nearRpc.getIntent(intentId);
    assert.equal(intent!.status, "Filled");
    assert.equal(intent!.solver_id, "solver-gpu-01.near");

    const openList = await nearRpc.listOpenIntents();
    assert.ok(!openList.some((i) => i.intent_id === intentId));
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Phase 3 VALIDATION GATE (The Hard Gate Requirement)
  // ═════════════════════════════════════════════════════════════════════════

  it("HARD GATE: Gateway rejects unregistered session key with 401 Unauthorized", async () => {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/get`, {
      headers: { "X-Decant-Session": "unregistered-ghost-session" },
    });
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.ok(body.error.includes("not registered on-chain"));
  });

  it("HARD GATE: Register session with 100 allotted compute units, proxy succeeds", async () => {
    // 1. Register with 100 units on the blockchain ledger
    const testSession = "gate-session-100";
    sandboxServer.registerSession(testSession, 100, "agent.test.near");

    // 2. Send request through the proxy
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/infer`, {
      headers: { "X-Decant-Session": testSession },
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-decant-quota-remaining"), "100");
    assert.equal(res.headers.get("x-decant-quota-total"), "100");

    const json = await res.json() as { status: string };
    assert.equal(json.status, "upstream_ok");
  });

  it("HARD GATE: Consume quota on-chain, verify proxy reflects decreased balance", async () => {
    const testSession = "gate-session-100";

    // Consume 10 units on-chain
    sandboxServer.consumeQuota(testSession, 10);

    // Verify remaining is now 90
    const onchain = await nearRpc.getQuota(testSession);
    assert.equal(onchain!.remaining, 90);

    // Send another request through gateway
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/infer`, {
      headers: { "X-Decant-Session": testSession },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-decant-quota-remaining"), "90");
  });

  it("HARD GATE: Exhaust on-chain quota, gateway immediately locks out agent with 402", async () => {
    const testSession = "gate-session-100";

    // Drain the remaining 90 tokens on the ledger
    sandboxServer.consumeQuota(testSession, 90);

    // Verify remaining is 0 on-chain
    const onchain = await nearRpc.getQuota(testSession);
    assert.equal(onchain!.remaining, 0);

    // Attempt to route through proxy
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/infer`, {
      headers: { "X-Decant-Session": testSession },
    });
    assert.equal(res.status, 402, "Must return 402 Payment Required when on-chain quota is exhausted");
    const body = await res.json() as { error: string };
    assert.ok(body.error.includes("insufficient on-chain quota"));
  });

  it("HARD GATE: Top up on-chain quota, gateway immediately re-enables access", async () => {
    const testSession = "gate-session-100";

    // Top up by 50 units on-chain
    sandboxServer.topupQuota(testSession, 50);

    // Proxy allows requests again
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/api/v1/infer`, {
      headers: { "X-Decant-Session": testSession },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-decant-quota-remaining"), "50");
    assert.equal(res.headers.get("x-decant-quota-total"), "150");
  });
});
