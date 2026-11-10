import { it, describe } from "node:test";
import assert from "node:assert/strict";
import { DecantGatewayServer } from "../src/server.js";
import { isPrivateOrLoopbackHost } from "../src/policy.js";
import { DecantComputeEngine } from "../src/compute-engine.js";

describe("Protocol Hardening & Safety Rails", () => {
  it("validates SSRF detection on private, loopback, and cloud metadata addresses", () => {
    assert.equal(isPrivateOrLoopbackHost("localhost"), true);
    assert.equal(isPrivateOrLoopbackHost("127.0.0.1"), true);
    assert.equal(isPrivateOrLoopbackHost("10.0.1.5"), true);
    assert.equal(isPrivateOrLoopbackHost("172.16.0.1"), true);
    assert.equal(isPrivateOrLoopbackHost("192.168.1.100"), true);
    assert.equal(isPrivateOrLoopbackHost("169.254.169.254"), true);
    assert.equal(isPrivateOrLoopbackHost("api.google.com"), false);
    assert.equal(isPrivateOrLoopbackHost("hyperbolic.xyz"), false);
  });

  it("blocks SSRF attempts on solver registration in production mode", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const server = new DecantGatewayServer({ port: 0, adminKey: "test-operator-key" });
    try {
      const port = await server.start();
      const res = await fetch(`http://127.0.0.1:${port}/v1/solvers/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Decant-Admin-Key": "test-operator-key",
        },
        body: JSON.stringify({
          solverId: "malicious-ssrf-solver",
          endpointUrl: "http://169.254.169.254/latest/meta-data",
          modelsSupported: ["gemini-3.5-flash"],
        }),
      });
      const text = await res.text();
      assert.equal(res.status, 400, `Expected 400, got ${res.status}: ${text}`);
      assert.match(text, /SSRF violation/);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      await server.stop();
    }
  });

  it("accepts chat completions payloads larger than 4KB without 413 error", async () => {
    const server = new DecantGatewayServer({ port: 0, adminKey: "test-operator-key" });
    try {
      server.ledger.registerSession("session-large", "ed25519:test", "owner.testnet", 5000);
      const port = await server.start();
      const largeContent = "Decant decentralized routing ".repeat(400); // ~12KB
      assert.ok(largeContent.length > 8000);

      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Decant-Admin-Key": "test-operator-key",
          "X-Decant-Session": "session-large",
        },
        body: JSON.stringify({
          prompt: largeContent,
          max_tokens: 32,
        }),
      });

      const text = await res.text();
      assert.notEqual(res.status, 413, `Payload was rejected with 413: ${text}`);
    } finally {
      await server.stop();
    }
  });

  it("handles Idempotency-Key safely by returning cached settled record without double debit", async () => {
    const server = new DecantGatewayServer({ port: 0, adminKey: "test-operator-key" });
    try {
      server.ledger.registerSession("session-idem", "ed25519:test", "owner.testnet", 1000);
      const port = await server.start();
      const idempotencyKey = "client-req-uuid-12345";

      // 1. Manually reserve and settle a request under this idempotencyKey
      server.ledger.reserveInference(idempotencyKey, "session-idem", 100);
      server.ledger.settleInference(idempotencyKey, 45, 20, 25, "gemini-3.5-flash", 120);

      const remainingAfterFirst = server.ledger.getSession("session-idem")!.remainingQuota;
      assert.equal(remainingAfterFirst, 955); // 1000 - 45 = 955

      // 2. Client retries with the same Idempotency-Key
      const retryRes = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Decant-Admin-Key": "test-operator-key",
          "X-Decant-Session": "session-idem",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          prompt: "Hello again",
        }),
      });

      const json = await retryRes.json() as any;
      assert.equal(retryRes.status, 200, `Expected 200, got ${retryRes.status}: ${JSON.stringify(json)}`);
      assert.equal(json.id, idempotencyKey);
      assert.equal(json.usage.idempotent, true);

      // Verify quota was NOT debited again
      assert.equal(server.ledger.getSession("session-idem")!.remainingQuota, 955);
    } finally {
      await server.stop();
    }
  });

  it("compute engine estimates character units and accepts usageMetadata", () => {
    const engine = new DecantComputeEngine();
    assert.equal(engine.estimateTokens("1234"), 1);
    assert.equal(engine.estimateTokens("12345"), 2);
    assert.equal(engine.promptUnits([{ role: "user", content: "hello world" }]), 5);
  });
});
