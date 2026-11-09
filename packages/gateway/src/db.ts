/**
 * db.ts — Production Persistent Ledger for Decant.
 *
 * Implements an ACID-compliant, persistent SQLite database using Node.js's built-in
 * `node:sqlite` engine. Ensures zero state loss across gateway restarts.
 *
 * Tables:
 *   - sessions: Registered session keys, public keys, and credit balances.
 *   - intents: Decentralized intent registry for agent compute requests.
 *   - transactions: Complete audit trail of every token burned, latency, and cost.
 *   - solvers: DePIN compute nodes and their reputation scores.
 */

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

export interface SessionRecord {
  sessionId: string;
  publicKey: string;
  ownerAccountId: string;
  totalQuota: number;
  remainingQuota: number;
  createdAt: number;
  status: "active" | "exhausted" | "suspended";
}

export interface IntentRecord {
  intentId: string;
  sessionId: string;
  model: string;
  maxBudget: number;
  status: "open" | "filled" | "settled" | "expired";
  solverId: string | null;
  createdAt: number;
  filledAt: number | null;
}

export interface TransactionRecord {
  txId: string;
  sessionId: string;
  promptTokens: number;
  completionTokens: number;
  costUnits: number;
  model: string;
  upstreamLatencyMs: number;
  timestamp: number;
}

export interface SolverRecord {
  solverId: string;
  endpointUrl: string;
  modelsSupported: string[];
  pricePerKTokens: number;
  reputationScore: number;
  isActive: boolean;
}

export const RECOVERY_MIN_AGE_MS = 5 * 60_000;
export interface ReservationReview {
  promptUnits: number;
  completionUnits: number;
  reason: string;
  evidenceReference: string;
  providerWorkStopped: boolean;
}

export class DecantLedger {
  private db: DatabaseSync;

  constructor(dbPath: string = ":memory:") {
    if (dbPath !== ":memory:") {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    // Enable WAL mode for high concurrency
    try {
      this.db.exec("PRAGMA journal_mode = WAL;");
    } catch {
      // Memory db doesn't require WAL
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reservation_reviews (
        request_id TEXT PRIMARY KEY,
        prompt_units INTEGER NOT NULL,
        completion_units INTEGER NOT NULL,
        reason TEXT NOT NULL,
        evidence_reference TEXT NOT NULL,
        reviewed_at INTEGER NOT NULL,
        reviewer_role TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS inference_reservations (
        request_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        reserved_units INTEGER NOT NULL CHECK(reserved_units > 0),
        used_units INTEGER,
        status TEXT NOT NULL CHECK(status IN ('reserved', 'settled')),
        created_at INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(session_id)
      );
      CREATE TABLE IF NOT EXISTS used_signatures (
        signature TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        owner_account_id TEXT NOT NULL,
        total_quota INTEGER NOT NULL,
        remaining_quota INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active', 'exhausted', 'suspended'))
      );

      CREATE TABLE IF NOT EXISTS intents (
        intent_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        model TEXT NOT NULL,
        max_budget INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('open', 'filled', 'settled', 'expired')),
        solver_id TEXT,
        created_at INTEGER NOT NULL,
        filled_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        tx_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        cost_units INTEGER NOT NULL,
        model TEXT NOT NULL,
        upstream_latency_ms INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      );

      CREATE TABLE IF NOT EXISTS solvers (
        solver_id TEXT PRIMARY KEY,
        endpoint_url TEXT NOT NULL,
        models_supported TEXT NOT NULL,
        price_per_k_tokens REAL NOT NULL,
        reputation_score REAL NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS solver_earnings (
        solver_id TEXT PRIMARY KEY,
        earned_credits INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS redemptions (
        redemption_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        credits_burned INTEGER NOT NULL,
        usdt_amount_cents INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
      CREATE INDEX IF NOT EXISTS idx_tx_session ON transactions(session_id);
      CREATE INDEX IF NOT EXISTS idx_redemptions_account ON redemptions(account_id);
    `);
  }

  /** Persistent replay barrier shared by gateway processes using this ledger. */
  public claimSignature(signature: string, timestamp: number): boolean {
    this.db.prepare("DELETE FROM used_signatures WHERE expires_at < ?").run(Date.now());
    return this.db.prepare("INSERT OR IGNORE INTO used_signatures (signature, expires_at) VALUES (?, ?)")
      .run(signature, timestamp + 60_000).changes === 1;
  }

  // ─── Session Management ───────────────────────────────────────────────────

  public registerSession(
    sessionId: string,
    publicKey: string,
    ownerAccountId: string,
    quota: number
  ): SessionRecord {
    if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
      throw new Error("Invalid sessionId: must be a non-empty string.");
    }
    if (!publicKey || typeof publicKey !== "string" || !publicKey.trim()) {
      throw new Error("Invalid publicKey: must be a non-empty string.");
    }
    if (!Number.isSafeInteger(quota) || quota <= 0) {
      throw new Error("Invalid quota: must be a positive number.");
    }

    const cleanSessionId = sessionId.trim();
    const existing = this.getSession(cleanSessionId);
    if (existing) {
      throw new Error(`Session '${cleanSessionId}' is already registered.`);
    }

    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO sessions (session_id, public_key, owner_account_id, total_quota, remaining_quota, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `);

    stmt.run(cleanSessionId, publicKey.trim(), ownerAccountId.trim(), quota, quota, now);
    return {
      sessionId: cleanSessionId,
      publicKey: publicKey.trim(),
      ownerAccountId: ownerAccountId.trim(),
      totalQuota: quota,
      remainingQuota: quota,
      createdAt: now,
      status: "active",
    };
  }

  public getSession(sessionId: string): SessionRecord | null {
    const stmt = this.db.prepare(`
      SELECT session_id, public_key, owner_account_id, total_quota, remaining_quota, created_at, status
      FROM sessions WHERE session_id = ?
    `);
    const row = stmt.get(sessionId) as any;
    if (!row) return null;

    return {
      sessionId: row.session_id,
      publicKey: row.public_key,
      ownerAccountId: row.owner_account_id,
      totalQuota: Number(row.total_quota),
      remainingQuota: Number(row.remaining_quota),
      createdAt: Number(row.created_at),
      status: row.status,
    };
  }

  public listSessions(): SessionRecord[] {
    const rows = this.db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`).all() as any[];
    return rows.map((row) => ({
      sessionId: row.session_id,
      publicKey: row.public_key,
      ownerAccountId: row.owner_account_id,
      totalQuota: Number(row.total_quota),
      remainingQuota: Number(row.remaining_quota),
      createdAt: Number(row.created_at),
      status: row.status,
    }));
  }

  /** Deduct the full authorized ceiling before any upstream work can start. */
  public reserveInference(requestId: string, sessionId: string, units: number): void {
    if (!Number.isSafeInteger(units) || units < 1) throw new Error("Invalid reservation units");
    this.db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      const result = this.db.prepare(`UPDATE sessions SET remaining_quota = remaining_quota - ?,
        status = CASE WHEN remaining_quota - ? = 0 THEN 'exhausted' ELSE 'active' END
        WHERE session_id = ? AND status != 'suspended' AND remaining_quota >= ?`)
        .run(units, units, sessionId, units);
      if (result.changes !== 1) throw new Error("Insufficient available credit for this request");
      this.db.prepare(`INSERT INTO inference_reservations
        (request_id, session_id, reserved_units, status, created_at) VALUES (?, ?, ?, 'reserved', ?)`)
        .run(requestId, sessionId, units, Date.now());
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  /** Charge observed usage and refund unused credit atomically, once per request. */
  public settleInference(requestId: string, usedUnits: number, promptUnits: number,
    completionUnits: number, model: string, latencyMs: number): void {
    if (!Number.isSafeInteger(usedUnits) || usedUnits < 0) throw new Error("Invalid usage units");
    this.db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      const row = this.db.prepare("SELECT * FROM inference_reservations WHERE request_id = ?").get(requestId) as any;
      if (!row) throw new Error("Reservation not found");
      if (row.status === 'settled') throw new Error("Reservation already settled");
      this.applyInferenceSettlement(row, requestId, usedUnits, promptUnits, completionUnits, model, latencyMs);
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  private applyInferenceSettlement(row: any, requestId: string, usedUnits: number, promptUnits: number,
    completionUnits: number, model: string, latencyMs: number): void {
    if (![usedUnits, promptUnits, completionUnits].every(v => Number.isSafeInteger(v) && v >= 0)
      || !Number.isSafeInteger(promptUnits + completionUnits) || promptUnits + completionUnits !== usedUnits) {
      throw new Error("Invalid usage breakdown");
    }
    if (usedUnits > row.reserved_units) throw new Error("Usage exceeded reserved credit");
    const refund = row.reserved_units - usedUnits;
    this.db.prepare(`UPDATE sessions SET remaining_quota = remaining_quota + ?,
      status = CASE WHEN status = 'suspended' THEN status WHEN remaining_quota + ? = 0 THEN 'exhausted' ELSE 'active' END
      WHERE session_id = ?`).run(refund, refund, row.session_id);
    this.db.prepare("UPDATE inference_reservations SET status = 'settled', used_units = ? WHERE request_id = ?")
      .run(usedUnits, requestId);
    if (usedUnits > 0) {
      this.db.prepare(`INSERT INTO transactions
        (tx_id, session_id, prompt_tokens, completion_tokens, cost_units, model, upstream_latency_ms, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(requestId, row.session_id, promptUnits, completionUnits, usedUnits, model, latencyMs, Date.now());


    }
  }

  /** Manual reconciliation, never an automatic expiry refund. Evidence is operator supplied. */
  public reviewReservation(requestId: string, review: ReservationReview): unknown {
    const reject = (message: string, statusCode: number): never => {
      throw Object.assign(new Error(message), { statusCode });
    };
    if (review.providerWorkStopped !== true || typeof review.reason !== "string" || !review.reason.trim()
      || review.reason.length > 1024 || typeof review.evidenceReference !== "string"
      || !review.evidenceReference.trim() || review.evidenceReference.length > 2048
      || ![review.promptUnits, review.completionUnits].every(v => Number.isSafeInteger(v) && v >= 0)
      || !Number.isSafeInteger(review.promptUnits + review.completionUnits)) {
      reject("Provide reviewed usage, reason, evidence reference and confirmation that provider work has stopped", 400);
    }
    this.db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      const row = this.db.prepare("SELECT * FROM inference_reservations WHERE request_id = ?").get(requestId) as any;
      if (!row) reject("Reservation not found", 404);
      if (row.status !== "reserved") reject("Reservation already settled", 409);
      if (Date.now() - row.created_at < RECOVERY_MIN_AGE_MS) reject("Reservation is too recent to review; wait at least five minutes", 409);
      const usedUnits = review.promptUnits + review.completionUnits;
      if (usedUnits > row.reserved_units) reject("Reviewed usage exceeds reserved credit", 400);
      this.applyInferenceSettlement(row, requestId, usedUnits, review.promptUnits,
        review.completionUnits, "operator-reviewed", 0);
      const reviewedAt = Date.now();
      this.db.prepare(`INSERT INTO reservation_reviews
        (request_id, prompt_units, completion_units, reason, evidence_reference, reviewed_at, reviewer_role)
        VALUES (?, ?, ?, ?, ?, ?, 'operator')`).run(requestId, review.promptUnits,
          review.completionUnits, review.reason.trim(), review.evidenceReference.trim(), reviewedAt);
      this.db.exec("COMMIT;");
      return { requestId, usedUnits, refundedUnits: row.reserved_units - usedUnits,
        reason: review.reason.trim(), evidenceReference: review.evidenceReference.trim(),
        reviewedAt, reviewerRole: "operator", verification: "operator-attested" };
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  public listReservationReviews(): unknown[] {
    return this.db.prepare("SELECT * FROM reservation_reviews ORDER BY reviewed_at DESC LIMIT 100").all();
  }

  public listReservations(): unknown[] {
    return this.db.prepare("SELECT * FROM inference_reservations WHERE status = 'reserved' ORDER BY created_at").all();
  }

  public topupQuota(sessionId: string, amount: number): SessionRecord {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("Invalid top-up amount: must be a positive number.");
    }

    const changed = this.db.prepare(`UPDATE sessions SET total_quota = total_quota + ?,
      remaining_quota = remaining_quota + ?,
      status = CASE WHEN status = 'suspended' THEN status ELSE 'active' END
      WHERE session_id = ? AND total_quota <= ?`)
      .run(amount, amount, sessionId, Number.MAX_SAFE_INTEGER - amount);
    if (changed.changes !== 1) {
      if (!this.getSession(sessionId)) throw new Error(`Session '${sessionId}' not found.`);
      throw new Error("Quota exceeds safe integer range");
    }
    return this.getSession(sessionId)!;
  }

  public suspendSession(sessionId: string): SessionRecord {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found.`);
    this.db.prepare("UPDATE sessions SET status = 'suspended' WHERE session_id = ?").run(sessionId);
    return { ...session, status: 'suspended' };
  }

  public resumeSession(sessionId: string): SessionRecord {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found.`);
    const newStatus = session.remainingQuota > 0 ? 'active' : 'exhausted';
    this.db.prepare("UPDATE sessions SET status = ? WHERE session_id = ?").run(newStatus, sessionId);
    return { ...session, status: newStatus };
  }

  // ─── Intent Registry ──────────────────────────────────────────────────────

  public broadcastIntent(sessionId: string, model: string, maxBudget: number): IntentRecord {
    if (!Number.isSafeInteger(maxBudget) || maxBudget <= 0) {
      throw new Error("Invalid maxBudget: must be a positive number.");
    }

    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found. Register first.`);
    }

    if (session.remainingQuota <= 0) {
      throw new Error("Insufficient remaining quota to broadcast compute intent.");
    }

    const intentId = `intent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    this.db
      .prepare(`
        INSERT INTO intents (intent_id, session_id, model, max_budget, status, created_at)
        VALUES (?, ?, ?, ?, 'open', ?)
      `)
      .run(intentId, sessionId, model, maxBudget, now);

    return {
      intentId,
      sessionId,
      model,
      maxBudget,
      status: "open",
      solverId: null,
      createdAt: now,
      filledAt: null,
    };
  }

  public fillIntent(intentId: string, solverId: string): IntentRecord {
    const stmt = this.db.prepare(`SELECT * FROM intents WHERE intent_id = ?`);
    const row = stmt.get(intentId) as any;
    if (!row) {
      throw new Error(`Intent '${intentId}' not found.`);
    }
    if (row.status !== "open") {
      throw new Error(`Intent '${intentId}' is already ${row.status}.`);
    }

    const now = Date.now();
    this.db
      .prepare(`UPDATE intents SET status = 'filled', solver_id = ?, filled_at = ? WHERE intent_id = ?`)
      .run(solverId, now, intentId);

    return {
      intentId,
      sessionId: row.session_id,
      model: row.model,
      maxBudget: Number(row.max_budget),
      status: "filled",
      solverId,
      createdAt: Number(row.created_at),
      filledAt: now,
    };
  }

  public listOpenIntents(): IntentRecord[] {
    const rows = this.db.prepare(`SELECT * FROM intents WHERE status = 'open' ORDER BY created_at DESC`).all() as any[];
    return rows.map((r) => ({
      intentId: r.intent_id,
      sessionId: r.session_id,
      model: r.model,
      maxBudget: Number(r.max_budget),
      status: r.status,
      solverId: r.solver_id,
      createdAt: Number(r.created_at),
      filledAt: r.filled_at ? Number(r.filled_at) : null,
    }));
  }

  // ─── Solver Earnings & Compute-to-Value Redemption ───────────────────────

  public getSolverEarnings(solverId: string): number {
    const cleanSolverId = (solverId || "").trim();
    const row = this.db.prepare(`SELECT earned_credits FROM solver_earnings WHERE solver_id = ?`).get(cleanSolverId) as any;
    return row ? Number(row.earned_credits) : 0;
  }

  public registerSolver(solver: SolverRecord): SolverRecord {
    if (!solver.solverId || !solver.solverId.trim()) throw new Error("solverId is required");
    const cleanId = solver.solverId.trim();
    const endpoint = solver.endpointUrl;
    const models = JSON.stringify(solver.modelsSupported);
    const price = Number(solver.pricePerKTokens) || 0;
    const rep = Number(solver.reputationScore) || 0;
    const active = solver.isActive !== false ? 1 : 0;

    this.db.prepare(`
      INSERT INTO solvers (solver_id, endpoint_url, models_supported, price_per_k_tokens, reputation_score, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(solver_id) DO UPDATE SET
        endpoint_url = excluded.endpoint_url,
        models_supported = excluded.models_supported,
        price_per_k_tokens = excluded.price_per_k_tokens,
        is_active = excluded.is_active
    `).run(cleanId, endpoint, models, price, rep, active);

    return this.getSolver(cleanId)!;
  }

  public getSolver(solverId: string): SolverRecord | null {
    const row = this.db.prepare(`SELECT * FROM solvers WHERE solver_id = ?`).get(solverId.trim()) as any;
    if (!row) return null;
    let models: string[] = [];
    try { models = JSON.parse(row.models_supported); } catch { models = [row.models_supported]; }
    return {
      solverId: row.solver_id,
      endpointUrl: row.endpoint_url,
      modelsSupported: models,
      pricePerKTokens: Number(row.price_per_k_tokens),
      reputationScore: Number(row.reputation_score),
      isActive: Boolean(row.is_active)
    };
  }

  public listSolvers(): SolverRecord[] {
    const rows = this.db.prepare(`SELECT * FROM solvers ORDER BY solver_id`).all() as any[];
    return rows.map((row) => {
      let models: string[] = [];
      try { models = JSON.parse(row.models_supported); } catch { models = [row.models_supported]; }
      return {
        solverId: row.solver_id,
        endpointUrl: row.endpoint_url,
        modelsSupported: models,
        pricePerKTokens: Number(row.price_per_k_tokens),
        reputationScore: Number(row.reputation_score),
        isActive: Boolean(row.is_active),
      };
    });
  }

  public setSolverActive(solverId: string, isActive: boolean): void {
    this.db.prepare(`UPDATE solvers SET is_active = ? WHERE solver_id = ?`)
      .run(isActive ? 1 : 0, solverId.trim());
  }

  public listRedemptions(limit: number = 20): any[] {
    const rows = this.db.prepare(`
      SELECT redemption_id, account_id, credits_burned, usdt_amount_cents, timestamp, status
      FROM redemptions
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map((r) => ({
      redemptionId: r.redemption_id,
      accountId: r.account_id,
      creditsBurned: Number(r.credits_burned),
      usdtAmountCents: Number(r.usdt_amount_cents),
      usdtAmountFormatted: (Number(r.usdt_amount_cents) / 100).toFixed(2),
      timestamp: Number(r.timestamp),
      status: r.status,
    }));
  }

  // ─── Auditing & Transactions ──────────────────────────────────────────────

  public getTransactionHistory(sessionId: string): TransactionRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM transactions WHERE session_id = ? ORDER BY timestamp DESC`)
      .all(sessionId) as any[];

    return rows.map((r) => ({
      txId: r.tx_id,
      sessionId: r.session_id,
      promptTokens: Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      costUnits: Number(r.cost_units),
      model: r.model,
      upstreamLatencyMs: Number(r.upstream_latency_ms),
      timestamp: Number(r.timestamp),
    }));
  }

  public listRecentTransactions(limit: number = 50): TransactionRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ?`)
      .all(limit) as any[];

    return rows.map((r) => ({
      txId: r.tx_id,
      sessionId: r.session_id,
      promptTokens: Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      costUnits: Number(r.cost_units),
      model: r.model,
      upstreamLatencyMs: Number(r.upstream_latency_ms),
      timestamp: Number(r.timestamp),
    }));
  }

  public close(): void {
    this.db.close();
  }
}
