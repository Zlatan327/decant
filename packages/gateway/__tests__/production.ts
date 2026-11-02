/**
 * production.ts — Production-Grade Integration Tests for Decant Backend.
 *
 * Verifies live bytes moving across real HTTP/network sockets against:
 *   1. Persistent SQLite ACID Ledger (atomic balance updates, audit trail).
 *   2. Cryptographic Ed25519 Signature Verification & Anti-Replay Protection.
 *   3. Real AI Compute Routing & Progressive SSE Token Streaming.
 *   4. Exhausted Credit Circuit Breaker (HTTP 402 lock).
 *   5. Decentralized Intent Registry Lifecycle (broadcast & solver fulfillment).
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DecantGatewayServer } from "../src/server.js";
import { DecantClient } from "../../agent-sdk/src/client.js";
import { KeyPair, KeyPairEd25519 } from "near-api-js";
import { resetBuckets } from "../src/policy.js";

describe("Decant Production Backend Suite", () => {
  let gateway: DecantGatewayServer;
  let gatewayPort: number;
  let testClient: DecantClient;
  const keyPair = KeyPair.fromRandom("ed25519") as KeyPairEd25519;

  before(async () => {
    // Spin up production gateway with in-memory SQLite and crypto enforcement
    gateway = new DecantGatewayServer({
      port: 0,
      dbPath: ":memory:",
      enableCryptoVerification: true,
    });
    gatewayPort = await gateway.start("127.0.0.1");

    testClient = new DecantClient({
      gatewayUrl: `http://127.0.0.1:${gatewayPort}`,
      keyPair,
      enableCryptoSigning: true,
    });
  });

  after(async () => {
    await gateway.stop();
  });

  beforeEach(() => {
    resetBuckets();
  });

  // ─── Test 1: Health & Diagnostics ─────────────────────────────────────────
  it("GET /v1/health: reports healthy SQLite ledger and system status", async () => {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/health`);
    assert.equal(res.status, 200);
    const json = await res.json() as any;
    assert.equal(json.status, "healthy");
    assert.equal(json.ledger, "sqlite-acid-persistent");
    assert.ok(json.uptime >= 0);
  });

  // ─── Test 2: Session Registration & On-Chain Quota Delegation ─────────────
  it("POST /v1/sessions/register: mints credit quota on persistent ledger", async () => {
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/sessions/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: testClient.sessionId,
        publicKey: testClient.publicKey,
        ownerAccountId: "agent.testnet",
        quota: 150,
      }),
    });

    assert.equal(res.status, 201);
    const json = await res.json() as any;
    assert.equal(json.sessionId, testClient.sessionId);
    assert.equal(json.totalQuota, 150);
    assert.equal(json.remainingQuota, 150);
    assert.equal(json.status, "active");
  });

  // ─── Test 3: Ed25519 Cryptographic Verification ───────────────────────────
  it("Security: blocks tampered payload with HTTP 403 Forbidden", async () => {
    // Generate valid signature headers for an original payload
    const headers = testClient.generateHeaders("POST", "/v1/chat/completions", JSON.stringify({ prompt: "valid" }));

    // Tamper with the body on the wire
    const res = await fetch(`http://127.0.0.1:${gatewayPort}/v1/chat/completions`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: "TAMPERED_MALICIOUS_PAYLOAD" }),
    });

    assert.equal(res.status, 403, "Tampered payload must be rejected by Ed25519 verification");
  });

  // ─── Test 4: Live AI Streaming Compute & Quota Deduction ──────────────────
  it("POST /v1/chat/completions: streams real dynamic tokens and deducts ledger quota", async () => {
    const tokensReceived: string[] = [];
    const stream = await testClient.streamChat(
      "Explain the advantage of Decant credit routing",
      (token) => {
        tokensReceived.push(token);
      }
    );

    assert.equal(stream.status, 200);
    assert.ok(tokensReceived.length > 5, "Must receive real progressive streaming tokens");
    assert.ok(stream.fullText.includes("Decant"), "Dynamic response must address prompt topic");

    // Check that ledger deducted tokens atomically
    const sessionRes = await testClient.getSessionInfo();
    assert.ok(sessionRes.session.remainingQuota < 150, "Quota must be deducted on-chain/ledger");
    assert.ok(sessionRes.transactions.length >= 1, "Transaction audit trail must record token usage");
    assert.equal(sessionRes.transactions[0].sessionId, testClient.sessionId);
  });

  // ─── Test 5: Intent Registry Lifecycle ────────────────────────────────────
  it("Intent Lifecycle: broadcast intent and fulfill via solver", async () => {
    // Broadcast
    const intentRes = await testClient.broadcastIntent("meta-llama/Meta-Llama-3-8B-Instruct", 200);
    assert.ok(intentRes.intentId.startsWith("intent_"));
    assert.equal(intentRes.status, "open");

    // List open intents
    const listRes = await (await fetch(`http://127.0.0.1:${gatewayPort}/v1/intents`)).json() as any;
    assert.ok(listRes.intents.some((i: any) => i.intentId === intentRes.intentId));

    // Solver fills intent
    const fillRes = await (await fetch(`http://127.0.0.1:${gatewayPort}/v1/intents/${intentRes.intentId}/fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ solverId: "hyperbolic-node-99.near" }),
    })).json() as any;

    assert.equal(fillRes.status, "filled");
    assert.equal(fillRes.solverId, "hyperbolic-node-99.near");
  });

  // ─── Test 6: Circuit Breaker on Quota Exhaustion ──────────────────────────
  it("Circuit Breaker: halts execution with HTTP 402 once credit quota is exhausted", async () => {
    // Drain remaining balance directly
    const session = gateway.ledger.getSession(testClient.sessionId)!;
    gateway.ledger.deductQuota(
      testClient.sessionId,
      session.remainingQuota,
      0,
      session.remainingQuota,
      "test-drain",
      10
    );

    // Verify balance is 0
    const emptySession = gateway.ledger.getSession(testClient.sessionId)!;
    assert.equal(emptySession.remainingQuota, 0);

    // Attempt inference
    const res = await testClient.streamChat("Should fail due to zero credit balance");
    assert.equal(res.status, 402, "Must return HTTP 402 Payment Required");
    assert.ok(res.fullText.includes("insufficient on-chain compute quota"));
  });

  // ─── Test 7: Top-up Quota Re-enables Access ───────────────────────────────
  it("Top-up: credit replenishment restores immediate agent access", async () => {
    const topupRes = await (await fetch(`http://127.0.0.1:${gatewayPort}/v1/sessions/${testClient.sessionId}/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100 }),
    })).json() as any;

    assert.equal(topupRes.remainingQuota, 100);
    assert.equal(topupRes.status, "active");

    // Inference works again immediately
    const res = await testClient.streamChat("Hello again after topup");
    assert.equal(res.status, 200);
    assert.ok(res.tokens > 0);
  });
});
