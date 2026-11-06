import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecantGatewayServer } from "../src/server.js";
import { DecantLedger } from "../src/db.js";
import { DecantClient } from "../../agent-sdk/src/client.js";
import { resetBuckets } from "../src/policy.js";

// A controlled local HTTP provider is a TEST FIXTURE, not proof of real model inference.
// It verifies provider transport, failure propagation and money invariants deterministically.
describe("Gateway provider transport and credit accounting", () => {
  let gateway: DecantGatewayServer;
  let base: string;
  let providerCalls = 0;
  let releaseProvider: (() => void) | undefined;
  let providerClosed: (() => void) | undefined;
  let providerClosePromise: Promise<void>;
  const envNames = ["UPSTREAM_BASE_URL", "UPSTREAM_MODEL", "DECANT_MODEL", "GEMINI_API_KEY", "GEMINI_MODEL"];
  const previous = new Map(envNames.map(k => [k, process.env[k]]));
  const frame = (res: ServerResponse, text: string) => res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
  const provider = createServer(async (req, res) => {
    providerCalls++;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.ok(body.max_tokens > 0);
    const prompt = body.messages[0].content;
    if (prompt === "failure") { res.writeHead(503); res.end(); return; }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    if (prompt === "overflow") { frame(res, "x".repeat(1000)); res.end("data: [DONE]\n\n"); return; }
    frame(res, "part");
    if (prompt === "partial") { res.end(); return; }
    if (prompt === "hold" || prompt === "cancel") {
      await new Promise<void>(resolve => {
        releaseProvider = resolve;
        res.on("close", () => { providerClosed?.(); resolve(); });
      });
    }
    if (!res.destroyed) { frame(res, " done"); res.end("data: [DONE]\n\n"); }
  });
  before(async () => {
    for (const key of envNames) delete process.env[key];
    await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
    const port = (provider.address() as { port: number }).port;
    process.env.UPSTREAM_BASE_URL = `http://127.0.0.1:${port}/v1`;
    process.env.UPSTREAM_MODEL = "fixture-model";
    gateway = new DecantGatewayServer({ port: 0, adminKey: "test-operator" });
    base = `http://127.0.0.1:${await gateway.start()}`;
  });
  after(async () => {
    releaseProvider?.();
    await gateway.stop();
    provider.closeAllConnections();
    await new Promise<void>(resolve => provider.close(() => resolve()));
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  beforeEach(() => resetBuckets());
  let counter = 0;
  const session = (quota = 1000) => {
    const client = new DecantClient({ gatewayUrl: base, sessionId: `transport-${counter++}`, maxOutputUnits: 20 });
    gateway.ledger.registerSession(client.sessionId, client.publicKey, "fixture.testnet", quota);
    return client;
  };
  const chat = (id: string, prompt: string, extra: object = {}) => fetch(base + "/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Decant-Admin-Key": "test-operator", "X-Decant-Session": id },
    body: JSON.stringify({ prompt, max_tokens: 20, ...extra }),
  });
  it("reserves credit and settles streamed usage before DONE", async () => {
    const client = session();
    const response = await client.streamChat("hello");
    assert.equal(response.fullText, "part done");
    assert.equal(response.creditUnits, 6);
    assert.equal(gateway.ledger.getSession(client.sessionId)!.remainingQuota, 994); // prompt 3 + completion 3
    assert.equal(gateway.ledger.getTransactionHistory(client.sessionId)[0].costUnits, 6);
    assert.deepEqual(gateway.ledger.listReservations(), []);
  });
  it("settles nonstreaming responses with explicitly estimated credit units", async () => {
    const client = session();
    const res = await chat(client.sessionId, "hello", { stream: false });
    assert.equal(res.status, 200);
    const data = await res.json() as any;
    assert.equal(data.choices[0].message.content, "part done");
    assert.equal(data.usage.credit_units, 6);
    assert.equal(gateway.ledger.getSession(client.sessionId)!.remainingQuota, 994);
  });
  it("rejects a one-credit session before contacting the provider", async () => {
    const client = session(1);
    const calls = providerCalls;
    assert.equal((await chat(client.sessionId, "hello")).status, 402);
    assert.equal(providerCalls, calls);
    assert.equal(gateway.ledger.getSession(client.sessionId)!.remainingQuota, 1);
  });
  it("blocks concurrent requests that would overspend reserved credit", async () => {
    const client = session(30);
    const first = await chat(client.sessionId, "hold");
    assert.equal(first.status, 200);
    assert.equal(gateway.ledger.getSession(client.sessionId)!.remainingQuota, 7);
    assert.equal((await chat(client.sessionId, "hold")).status, 402);
    releaseProvider!();
    assert.ok((await first.text()).includes("[DONE]"));
    assert.equal(gateway.ledger.getSession(client.sessionId)!.remainingQuota, 24);
  });
  it("refunds a failed provider call without manufacturing a response", async () => {
    const client = session();
    const response = await chat(client.sessionId, "failure");
    assert.equal(response.status, 502);
    assert.equal(gateway.ledger.getSession(client.sessionId)!.remainingQuota, 1000);
    assert.deepEqual(gateway.ledger.listReservations(), []);
  });
  it("settles partial usage and reports truncated provider streams as errors", async () => {
    const client = session();
    const response = await chat(client.sessionId, "partial");
    assert.equal(response.status, 200); // Headers precede the provider failure.
    const body = await response.text();
    assert.ok(body.includes('"error"'));
    assert.ok(!body.includes("[DONE]"));
    assert.equal(gateway.ledger.getSession(client.sessionId)!.remainingQuota, 995); // prompt 4 + completion 1
    assert.deepEqual(gateway.ledger.listReservations(), []);
  });
  it("caps provider output at the reserved ceiling", async () => {
    const client = session();
    const res = await chat(client.sessionId, "overflow");
    assert.equal(res.status, 502);
    assert.equal(gateway.ledger.getSession(client.sessionId)!.remainingQuota, 1000);
  });
  it("cancels upstream work after client disconnect and releases unused credit", async () => {
    const client = session();
    providerClosePromise = new Promise(resolve => { providerClosed = resolve; });
    const res = await chat(client.sessionId, "cancel");
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await Promise.race([providerClosePromise, new Promise((_, reject) => setTimeout(() => reject(new Error("Provider did not abort")), 2000).unref())]);
    // Settlement and upstream closure occur in adjacent promise callbacks.
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(gateway.ledger.listReservations(), []);
    assert.equal(gateway.ledger.getSession(client.sessionId)!.remainingQuota, 996);
  });
  it("rejects invalid units, unsupported models and chunked oversized bodies", async () => {
    const client = session();
    for (const max_tokens of [-1, 0, 1.5, "20", 5000]) {
      resetBuckets(); assert.equal((await chat(client.sessionId, "hello", { max_tokens })).status, 400);
    }
    resetBuckets();
    assert.equal((await chat(client.sessionId, "hello", { model: "not-enabled" })).status, 400);
    resetBuckets();
    const res = await fetch(base + "/v1/chat/completions", {
      method: "POST", headers: { "X-Decant-Admin-Key": "test-operator", "X-Decant-Session": client.sessionId },
      body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(5000))); controller.close(); } }),
      duplex: "half",
    } as RequestInit);
    assert.equal(res.status, 413);
  });
  it("returns unavailable when a real provider is not configured", async () => {
    const old = process.env.UPSTREAM_BASE_URL;
    delete process.env.UPSTREAM_BASE_URL;
    const unconfigured = new DecantGatewayServer({ port: 0, adminKey: "test-operator" });
    try {
      unconfigured.ledger.registerSession("no-provider", "key", "fixture.testnet", 1000);
      const port = await unconfigured.start();
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST", headers: { "X-Decant-Admin-Key": "test-operator", "X-Decant-Session": "no-provider" },
        body: JSON.stringify({ prompt: "hello" }),
      });
      assert.equal(res.status, 503);
    } finally { await unconfigured.stop(); process.env.UPSTREAM_BASE_URL = old; }
  });
});

it("keeps reservations across restart, prevents double settlement and serializes separate ledger connections", () => {
  const directory = mkdtempSync(join(tmpdir(), "decant-credit-"));
  const file = join(directory, "ledger.db");
  let first = new DecantLedger(file);
  const second = new DecantLedger(file);
  try {
    first.registerSession("shared", "key", "fixture.testnet", 30);
    first.reserveInference("request-1", "shared", 23);
    assert.throws(() => second.reserveInference("request-2", "shared", 23), /Insufficient/);
    first.close(); first = new DecantLedger(file);
    assert.equal(first.getSession("shared")!.remainingQuota, 7);
    assert.equal(first.listReservations().length, 1);
    first.settleInference("request-1", 6, 3, 3, "fixture-model", 1);
    assert.throws(() => second.settleInference("request-1", 6, 3, 3, "fixture-model", 1), /already settled/);
    assert.equal(second.getSession("shared")!.remainingQuota, 24);
    assert.throws(() => second.topupQuota("shared", 1.5), /Invalid/);
    assert.throws(() => second.topupQuota("shared", Number.MAX_SAFE_INTEGER), /safe integer/);
  } finally { first.close(); second.close(); rmSync(directory, { recursive: true, force: true }); }
});
