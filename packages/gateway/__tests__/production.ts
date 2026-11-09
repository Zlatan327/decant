import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecantGatewayServer } from "../src/server.js";
import { DecantLedger } from "../src/db.js";

it("returns unavailable when a real provider is not configured", async () => {
  const keys = ['UPSTREAM_BASE_URL', 'UPSTREAM_MODEL', 'DECANT_MODEL', 'GEMINI_API_KEY', 'GEMINI_MODEL'] as const;
  const previous = keys.map(key => process.env[key]);
  for (const key of keys) delete process.env[key];
  const unconfigured = new DecantGatewayServer({ port: 0, adminKey: "test-operator" });
  try {
    unconfigured.ledger.registerSession("no-provider", "key", "fixture.testnet", 1000);
    const port = await unconfigured.start();
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST", headers: { "X-Decant-Admin-Key": "test-operator", "X-Decant-Session": "no-provider" },
      body: JSON.stringify({ prompt: "hello" }),
    });
    assert.equal(res.status, 503);
  } finally {
    await unconfigured.stop();
    keys.forEach((key, index) => {
      const value = previous[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
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
