import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import { PgDecantLedger } from "../src/pg-ledger.js";
import { DecantGatewayServer } from "../src/server.js";
import { DecantClient } from "../../agent-sdk/src/client.js";
import { RECOVERY_MIN_AGE_MS } from "../src/db.js";

describe("PostgreSQL Production Ledger & PgBouncer Safety", () => {
  function createMemPgLedger(): { ledger: PgDecantLedger; pool: any } {
    const db = newDb();
    const pg = db.adapters.createPg();
    const pool = new pg.Pool();
    const ledger = new PgDecantLedger(pool);
    return { ledger, pool };
  }

  it("initializes schema idempotently and registers sessions", async () => {
    const { ledger } = createMemPgLedger();
    await ledger.initSchema();
    // Re-run to verify idempotency
    await ledger.initSchema();

    const session = await ledger.registerSession("sess-pg-1", "pubkey-123", "alice.testnet", 1000);
    assert.equal(session.sessionId, "sess-pg-1");
    assert.equal(session.remainingQuota, 1000);
    assert.equal(session.status, "active");

    const fetched = await ledger.getSession("sess-pg-1");
    assert.deepEqual(fetched, session);

    // Duplicate session registration fails
    await assert.rejects(
      async () => ledger.registerSession("sess-pg-1", "pubkey-123", "alice.testnet", 1000),
      /already registered/
    );
  });

  it("reserves quota, prevents double settlement, and calculates refunds correctly", async () => {
    const { ledger } = createMemPgLedger();
    await ledger.initSchema();

    await ledger.registerSession("sess-pg-2", "pubkey-456", "bob.testnet", 100);

    // Reserve 60 units
    await ledger.reserveInference("req-pg-1", "sess-pg-2", 60);
    let s = await ledger.getSession("sess-pg-2");
    assert.equal(s!.remainingQuota, 40);

    // Attempting to reserve 50 units should fail (only 40 remaining)
    await assert.rejects(
      async () => ledger.reserveInference("req-pg-2", "sess-pg-2", 50),
      /Insufficient/
    );

    // Settle with 25 units used (15 prompt + 10 completion) -> 35 units refunded
    await ledger.settleInference("req-pg-1", 25, 15, 10, "gemini-3.8-flash", 120);
    s = await ledger.getSession("sess-pg-2");
    assert.equal(s!.remainingQuota, 75); // 40 + 35 = 75

    // Double settlement must be rejected
    await assert.rejects(
      async () => ledger.settleInference("req-pg-1", 25, 15, 10, "gemini-3.8-flash", 120),
      /already settled/
    );

    // Transaction history should record the settled request
    const txs = await ledger.getTransactionHistory("sess-pg-2");
    assert.equal(txs.length, 1);
    assert.equal(txs[0].costUnits, 25);
    assert.equal(txs[0].promptTokens, 15);
    assert.equal(txs[0].completionTokens, 10);
    assert.equal(txs[0].model, "gemini-3.8-flash");
  });

  it("handles operator reviews for stalled reservations", async () => {
    const { ledger, pool } = createMemPgLedger();
    await ledger.initSchema();

    await ledger.registerSession("sess-pg-3", "pubkey-789", "carol.testnet", 200);
    await ledger.reserveInference("req-stalled-1", "sess-pg-3", 150);

    // Age the reservation to simulate stalled work > 5 minutes
    const agedTime = Date.now() - RECOVERY_MIN_AGE_MS - 2000;
    await pool.query(
      "UPDATE inference_reservations SET created_at = $1 WHERE request_id = $2",
      [agedTime, "req-stalled-1"]
    );

    const reviewRes = await ledger.reviewReservation("req-stalled-1", {
      promptUnits: 20,
      completionUnits: 30,
      reason: "Container crashed mid-stream, inspected raw logs",
      evidenceReference: "logs/cluster/gateway-2/req-stalled-1.log",
      providerWorkStopped: true,
    }) as any;

    assert.equal(reviewRes.usedUnits, 50);
    assert.equal(reviewRes.refundedUnits, 100);
    assert.equal(reviewRes.verification, "operator-attested");

    const s = await ledger.getSession("sess-pg-3");
    assert.equal(s!.remainingQuota, 150); // 50 remaining after reserve + 100 refund = 150
  });

  it("auto-settles stalled reservations charging ceiling in operator favor", async () => {
    const { ledger, pool } = createMemPgLedger();
    await ledger.initSchema();

    await ledger.registerSession("sess-auto", "pubkey-auto", "dave.testnet", 500);
    await ledger.reserveInference("req-auto-1", "sess-auto", 200);

    // Age reservation past 10 minutes (600,000 ms)
    const oldTime = Date.now() - 15 * 60_000;
    await pool.query(
      "UPDATE inference_reservations SET created_at = $1 WHERE request_id = $2",
      [oldTime, "req-auto-1"]
    );

    const autoSettled = await ledger.autoSettleStalled(10 * 60_000);
    assert.equal(autoSettled.length, 1);
    assert.equal(autoSettled[0].requestId, "req-auto-1");
    assert.equal(autoSettled[0].chargedUnits, 200);

    const res = await ledger.getReservation("req-auto-1");
    assert.equal(res!.status, "settled");
    assert.equal(res!.usedUnits, 200);

    // Quota should reflect full 200 deduction (0 refunded)
    const s = await ledger.getSession("sess-auto");
    assert.equal(s!.remainingQuota, 300);
  });

  it("enforces persistent replay protection across cluster nodes", async () => {
    const { ledger } = createMemPgLedger();
    await ledger.initSchema();

    const sig = "sig-ed25519-abc123xyz";
    const ts = Date.now();

    const first = await ledger.claimSignature(sig, ts);
    assert.equal(first, true);

    const replay = await ledger.claimSignature(sig, ts);
    assert.equal(replay, false);
  });

  it("integrates with DecantGatewayServer and reports postgres ledger health", async () => {
    const { ledger } = createMemPgLedger();
    await ledger.initSchema();

    const server = new DecantGatewayServer({
      port: 0,
      ledger,
      adminKey: "test-pg-operator",
    });

    const port = await server.start("127.0.0.1");
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 200);
      const data = await res.json() as any;
      assert.equal(data.ledger, "postgres-connection-pool");

      // Test session registration via HTTP API into Postgres
      const client = new DecantClient({ gatewayUrl: `http://127.0.0.1:${port}`, sessionId: "http-pg-sess" });
      const regRes = await fetch(`http://127.0.0.1:${port}/v1/sessions/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Decant-Admin-Key": "test-pg-operator",
        },
        body: JSON.stringify({
          sessionId: client.sessionId,
          publicKey: client.publicKey,
          ownerAccountId: "tester.testnet",
          quota: 5000,
        }),
      });
      assert.equal(regRes.status, 201);

      // Verify session exists in PostgreSQL ledger
      const sessionInPg = await ledger.getSession("http-pg-sess");
      assert.ok(sessionInPg);
      assert.equal(sessionInPg.totalQuota, 5000);
    } finally {
      await server.stop();
    }
  });
});
