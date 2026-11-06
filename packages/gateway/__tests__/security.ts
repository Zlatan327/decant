import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecantGatewayServer } from "../src/server.js";
import { DecantCrypto } from "../src/crypto.js";
import { DecantClient } from "../../agent-sdk/src/client.js";
import { resetBuckets } from "../src/policy.js";

// These tests exercise HTTP authorization and SQLite, not live provider inference.
describe("Gateway authorization regressions", () => {
  let gateway: DecantGatewayServer;
  let base: string;
  let agent: DecantClient;
  let other: DecantClient;
  const adminKey = "security-test-operator";
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(base + path, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  before(async () => {
    gateway = new DecantGatewayServer({ port: 0, adminKey });
    base = `http://127.0.0.1:${await gateway.start()}`;
    agent = new DecantClient({ gatewayUrl: base, sessionId: "agent-a" });
    other = new DecantClient({ gatewayUrl: base, sessionId: "agent-b" });
    gateway.ledger.registerSession(agent.sessionId, agent.publicKey, "agent-a.testnet", 10000);
    gateway.ledger.registerSession(other.sessionId, other.publicKey, "agent-b.testnet", 10000);
    gateway.ledger.registerSession("shared-key", agent.publicKey, "agent-a.testnet", 10000);
  });
  after(async () => gateway.stop());
  beforeEach(() => resetBuckets());

  it("rejects inference for unknown sessions even with the operator key", async () => {
    for (const headers of [{ "X-Decant-Session": "unknown" }, { "X-Decant-Session": "unknown", "X-Decant-Admin-Key": adminKey }]) {
      const res = await post("/v1/chat/completions", { prompt: "hello" }, headers);
      assert.equal(res.status, 401);
    }
  });
  it("rejects session IDs without signatures", async () => {
    const res = await post("/v1/chat/completions", { prompt: "hello" }, { "X-Decant-Session": agent.sessionId });
    assert.equal(res.status, 401);
  });
  it("protects registration, topups, rewards, redemption, fill, and private listings", async () => {
    for (const path of ["/v1/sessions/register", "/v1/sessions/agent-a/topup", "/v1/solvers/agent-a.testnet/reward", "/v1/solvers/agent-a.testnet/redeem", "/v1/intents/unknown/fill"]) {
      assert.equal((await post(path, { quota: 100, amount: 100, credits: 100 })).status, 403, path);
    }
    for (const path of ["/v1/sessions", "/v1/transactions", "/v1/intents", "/v1/redemptions"]) {
      assert.equal((await fetch(base + path)).status, 403, path);
    }
    assert.equal(gateway.ledger.getSolverEarnings("agent-a.testnet"), 0);
  });
  it("validates registration and does not accept fabricated key strings", async () => {
    const headers = { "X-Decant-Admin-Key": adminKey };
    assert.equal((await post("/v1/sessions/register", { sessionId: "bad-key", publicKey: "ed25519:not-a-key", quota: 100 }, headers)).status, 400);
    assert.equal((await post("/v1/sessions/register", null, headers)).status, 400);
    assert.equal(gateway.ledger.getSession("bad-key"), null);
    const client = new DecantClient({ sessionId: "registered-through-http" });
    assert.equal((await post("/v1/sessions/register", { sessionId: client.sessionId, publicKey: client.publicKey, quota: 100 }, headers)).status, 201);
    assert.equal((await post(`/v1/sessions/${client.sessionId}/topup`, { amount: 50 }, headers)).status, 200);
    assert.equal(gateway.ledger.getSession(client.sessionId)!.remainingQuota, 150);
  });
  it("allows signed session reads but rejects impersonation and tampering", async () => {
    assert.equal((await agent.request("/v1/sessions/agent-a")).status, 200);
    assert.equal((await other.request("/v1/sessions/agent-a")).status, 401);
    const path = "/v1/intents/broadcast";
    const original = JSON.stringify({ sessionId: agent.sessionId, maxBudget: 100 });
    const headers = agent.generateHeaders("POST", path, original);
    assert.equal((await post(path, { sessionId: other.sessionId, maxBudget: 100 }, headers)).status, 401);
    assert.equal((await post(path, { sessionId: agent.sessionId, maxBudget: 200 }, headers)).status, 403);
  });
  it("binds signatures to session ID even when sessions share a public key", async () => {
    const path = "/v1/intents/broadcast";
    const body = { sessionId: "shared-key", maxBudget: 100 };
    const headers = agent.generateHeaders("POST", path, JSON.stringify(body));
    headers["X-Decant-Session"] = "shared-key";
    assert.equal((await post(path, body, headers)).status, 403);
  });
  it("rejects malformed timestamps and noncanonical signatures", async () => {
    const path = "/v1/intents/broadcast";
    const body = { sessionId: agent.sessionId, maxBudget: 100 };
    for (const timestamp of ["NaN", "Infinity", "123junk", ""]) {
      const headers = agent.generateHeaders("POST", path, JSON.stringify(body));
      headers["X-Decant-Timestamp"] = timestamp;
      assert.equal((await post(path, body, headers)).status, 403);
    }
    const headers = agent.generateHeaders("POST", path, JSON.stringify(body));
    headers["X-Decant-Signature"] += "zz";
    assert.equal((await post(path, body, headers)).status, 403);
  });
  it("accepts a valid signed intent once and never rewards assignment", async () => {
    const path = "/v1/intents/broadcast";
    const body = { sessionId: agent.sessionId, maxBudget: 100 };
    const headers = agent.generateHeaders("POST", path, JSON.stringify(body));
    const response = await post(path, body, headers);
    assert.equal(response.status, 201);
    assert.equal((await post(path, body, headers)).status, 403);
    const intent = await response.json() as { intentId: string };
    assert.equal((await post(`/v1/intents/${intent.intentId}/fill`, { solverId: "solver.testnet" }, { "X-Decant-Admin-Key": adminKey })).status, 200);
    assert.equal(gateway.ledger.getSolverEarnings("solver.testnet"), 0);
  });
  it("does not mint rewards or burn credits through unconnected payout routes", async () => {
    gateway.ledger.recordSolverEarnings("solver.testnet", 200);
    for (const action of ["reward", "redeem"]) {
      assert.equal((await post(`/v1/solvers/solver.testnet/${action}`, { amount: 500, credits: 100 },
        { "X-Decant-Admin-Key": adminKey })).status, 503);
    }
    assert.equal(gateway.ledger.getSolverEarnings("solver.testnet"), 200);
    assert.deepEqual(gateway.ledger.listRedemptions(), []);
  });
  it("reports disconnected chain state honestly", async () => {
    const res = await fetch(base + "/v1/health");
    assert.equal((await res.json() as { nearSync: string }).nearSync, "not-connected");
  });
});

it("fails closed when no operator credential is configured", async () => {
  const oldKey = process.env.DECANT_ADMIN_KEY;
  delete process.env.DECANT_ADMIN_KEY;
  const gateway = new DecantGatewayServer({ port: 0 });
  try {
    const port = await gateway.start();
    const res = await fetch(`http://127.0.0.1:${port}/v1/sessions/register`, { method: "POST" });
    assert.equal(res.status, 503);
  } finally {
    await gateway.stop();
    if (oldKey !== undefined) process.env.DECANT_ADMIN_KEY = oldKey;
  }
});

it("rejects signed request replay after a gateway restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "decant-replay-"));
  const dbPath = join(directory, "ledger.db");
  let gateway = new DecantGatewayServer({ port: 0, dbPath });
  const agent = new DecantClient({ sessionId: "restart-agent" });
  const path = "/v1/sessions/restart-agent";
  const headers = agent.generateHeaders("GET", path);
  try {
    gateway.ledger.registerSession(agent.sessionId, agent.publicKey, "agent.testnet", 100);
    let port = await gateway.start();
    assert.equal((await fetch(`http://127.0.0.1:${port}${path}`, { headers })).status, 200);
    await gateway.stop();
    DecantCrypto.resetReplayCache();
    gateway = new DecantGatewayServer({ port: 0, dbPath });
    port = await gateway.start();
    assert.equal((await fetch(`http://127.0.0.1:${port}${path}`, { headers })).status, 403);
  } finally {
    await gateway.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});
