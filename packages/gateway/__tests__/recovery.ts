import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecantGatewayServer } from "../src/server.js";
import { DecantLedger, RECOVERY_MIN_AGE_MS } from "../src/db.js";

// Real HTTP and SQLite, with deliberately aged test reservations. No live provider work.
describe("Operator-reviewed reservation recovery", () => {
  const directory = mkdtempSync(join(tmpdir(), "decant-review-"));
  const dbPath = join(directory, "ledger.db");
  let gateway: DecantGatewayServer;
  let sql: DatabaseSync;
  let base: string;
  let count = 0;
  const review = { promptUnits: 10, completionUnits: 5, reason: "Provider work checked and stopped",
    evidenceReference: "test-fixture/provider-log/request", providerWorkStopped: true };
  const makeReservation = (aged = true) => {
    const requestId = `review-${count++}`;
    gateway.ledger.registerSession(requestId, "test-only-key", "fixture", 100);
    gateway.ledger.reserveInference(requestId, requestId, 60);
    if (aged) sql.prepare("UPDATE inference_reservations SET created_at = ? WHERE request_id = ?")
      .run(Date.now() - RECOVERY_MIN_AGE_MS - 1000, requestId);
    return requestId;
  };
  const post = (id: string, body: object = review, authenticated = true) => fetch(`${base}/v1/reservations/${id}/review`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { "X-Decant-Admin-Key": "review-operator" } : {}) },
    body: JSON.stringify(body),
  });
  before(async () => {
    gateway = new DecantGatewayServer({ port: 0, dbPath, adminKey: "review-operator" });
    sql = new DatabaseSync(dbPath);
    base = `http://127.0.0.1:${await gateway.start()}`;
  });
  after(async () => { sql.close(); await gateway.stop(); rmSync(directory, { recursive: true, force: true }); });

  it("requires operator authorization on write and evidence listing", async () => {
    const id = makeReservation();
    assert.equal((await post(id, review, false)).status, 403);
    assert.equal((await fetch(base + "/v1/reservation-reviews")).status, 403);
    assert.equal(gateway.ledger.getSession(id)!.remainingQuota, 40);
  });
  it("refuses recent reservations and never refunds them by age alone", async () => {
    const id = makeReservation(false);
    assert.equal((await post(id)).status, 409);
    assert.equal(gateway.ledger.getSession(id)!.remainingQuota, 40);
    assert.ok(gateway.ledger.listReservations().length >= 1);
  });
  it("requires reviewed usage, evidence, reason and stopped-work confirmation", async () => {
    const id = makeReservation();
    for (const invalid of [{ providerWorkStopped: false }, { reason: "" }, { evidenceReference: "" },
      { promptUnits: -1 }, { completionUnits: 1.5 }, { completionUnits: "5" }, { completionUnits: 100 },
      { promptUnits: Number.MAX_SAFE_INTEGER, completionUnits: 1 }]) {
      assert.equal((await post(id, { ...review, ...invalid })).status, 400);
      assert.equal(gateway.ledger.getSession(id)!.remainingQuota, 40);
    }
  });
  it("settles reviewed usage and saves an explicitly operator-attested audit record", async () => {
    const id = makeReservation();
    const response = await post(id);
    assert.equal(response.status, 200);
    const data = await response.json() as any;
    assert.equal(data.review.usedUnits, 15);
    assert.equal(data.review.refundedUnits, 45);
    assert.equal(data.review.verification, "operator-attested");
    assert.equal(gateway.ledger.getSession(id)!.remainingQuota, 85);
    const tx = gateway.ledger.getTransactionHistory(id)[0];
    assert.equal(tx.costUnits, 15);
    assert.equal(tx.model, "operator-reviewed");
    const audit = (gateway.ledger.listReservationReviews() as any[]).find(r => r.request_id === id);
    assert.equal(audit.evidence_reference, review.evidenceReference);
    assert.equal(audit.reviewer_role, "operator");
  });
  it("rejects duplicate review and subsequent normal settlement across ledger connections", async () => {
    const id = makeReservation();
    assert.equal((await post(id)).status, 200);
    assert.equal((await post(id)).status, 409);
    const other = new DecantLedger(dbPath);
    try {
      assert.throws(() => other.settleInference(id, 15, 10, 5, "fixture", 1), /already settled/);
      assert.throws(() => other.reviewReservation(id, review), /already settled/);
      assert.equal(other.getSession(id)!.remainingQuota, 85);
      assert.equal(other.getTransactionHistory(id).length, 1);
    } finally { other.close(); }
  });
  it("refunds zero-use work only after an explicit review and preserves suspended status", async () => {
    const id = makeReservation();
    sql.prepare("UPDATE sessions SET status = 'suspended' WHERE session_id = ?").run(id);
    assert.equal((await post(id, { ...review, promptUnits: 0, completionUnits: 0 })).status, 200);
    assert.equal(gateway.ledger.getSession(id)!.remainingQuota, 100);
    assert.equal(gateway.ledger.getSession(id)!.status, "suspended");
    assert.deepEqual(gateway.ledger.getTransactionHistory(id), []);
  });
  it("rolls back balance and settlement if the review audit cannot be written", async () => {
    const id = makeReservation();
    sql.exec("CREATE TRIGGER reject_review BEFORE INSERT ON reservation_reviews BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
    try {
      assert.equal((await post(id)).status, 500);
      assert.equal(gateway.ledger.getSession(id)!.remainingQuota, 40);
      assert.equal((sql.prepare("SELECT status FROM inference_reservations WHERE request_id = ?").get(id) as any).status, "reserved");
      assert.deepEqual(gateway.ledger.getTransactionHistory(id), []);
    } finally { sql.exec("DROP TRIGGER reject_review"); }
  });
  it("returns not found for unknown reservations", async () => { assert.equal((await post("missing")).status, 404); });
});
