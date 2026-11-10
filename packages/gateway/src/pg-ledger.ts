/**
 * pg-ledger.ts — Production PostgreSQL Persistent Ledger for Decant.
 *
 * Implements an ACID-compliant, connection-pooled PostgreSQL ledger designed
 * for horizontally-scaled multi-node gateway clusters.
 *
 * PgBouncer Transaction Mode Compatible:
 *   - No session-level state, no temporary tables, no advisory locks.
 *   - Strict row-level locking (SELECT ... FOR UPDATE) inside explicit BEGIN/COMMIT blocks.
 *   - Fully safe for transaction pooling proxies (PgBouncer, AWS RDS Proxy, Supabase Pooler).
 */

import pg from "pg";
const { Pool } = pg;
import type {
  SessionRecord,
  IntentRecord,
  TransactionRecord,
  SolverRecord,
  ReservationReview,
} from "./db.js";
import { RECOVERY_MIN_AGE_MS } from "./db.js";

export class PgDecantLedger {
  public readonly pool: pg.Pool;
  private isExternalPool: boolean;

  constructor(connectionStringOrPool?: string | pg.Pool) {
    if (connectionStringOrPool && typeof connectionStringOrPool !== "string") {
      this.pool = connectionStringOrPool;
      this.isExternalPool = true;
    } else {
      const connStr =
        (typeof connectionStringOrPool === "string" && connectionStringOrPool) ||
        process.env.DATABASE_URL ||
        process.env.POSTGRES_URL ||
        "postgres://postgres:postgres@localhost:5432/decant";
      this.pool = new Pool({
        connectionString: connStr,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
      this.isExternalPool = false;
    }
  }

  public async initSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const check = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name = 'sessions'"
      );
      if (check.rows.length > 0) return;

      await client.query(`
        CREATE TABLE IF NOT EXISTS reservation_reviews (
          request_id VARCHAR(255) PRIMARY KEY,
          prompt_units INT NOT NULL,
          completion_units INT NOT NULL,
          reason TEXT NOT NULL,
          evidence_reference TEXT NOT NULL,
          reviewed_at BIGINT NOT NULL,
          reviewer_role VARCHAR(64) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS inference_reservations (
          request_id VARCHAR(255) PRIMARY KEY,
          session_id VARCHAR(255) NOT NULL,
          reserved_units INT NOT NULL CHECK(reserved_units > 0),
          used_units INT,
          status VARCHAR(32) NOT NULL CHECK(status IN ('reserved', 'settled')),
          created_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS used_signatures (
          signature VARCHAR(255) PRIMARY KEY,
          expires_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          session_id VARCHAR(255) PRIMARY KEY,
          public_key VARCHAR(255) NOT NULL,
          owner_account_id VARCHAR(255) NOT NULL,
          total_quota BIGINT NOT NULL,
          remaining_quota BIGINT NOT NULL,
          created_at BIGINT NOT NULL,
          status VARCHAR(32) NOT NULL CHECK(status IN ('active', 'exhausted', 'suspended'))
        );

        CREATE TABLE IF NOT EXISTS intents (
          intent_id VARCHAR(255) PRIMARY KEY,
          session_id VARCHAR(255) NOT NULL,
          model VARCHAR(255) NOT NULL,
          max_budget BIGINT NOT NULL,
          status VARCHAR(32) NOT NULL CHECK(status IN ('open', 'filled', 'settled', 'expired')),
          solver_id VARCHAR(255),
          created_at BIGINT NOT NULL,
          filled_at BIGINT,
          FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS transactions (
          tx_id VARCHAR(255) PRIMARY KEY,
          session_id VARCHAR(255) NOT NULL,
          prompt_tokens INT NOT NULL,
          completion_tokens INT NOT NULL,
          cost_units INT NOT NULL,
          model VARCHAR(255) NOT NULL,
          upstream_latency_ms INT NOT NULL,
          timestamp BIGINT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS solvers (
          solver_id VARCHAR(255) PRIMARY KEY,
          endpoint_url TEXT NOT NULL,
          models_supported TEXT NOT NULL,
          price_per_k_tokens NUMERIC NOT NULL,
          reputation_score NUMERIC NOT NULL,
          is_active INT NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS solver_earnings (
          solver_id VARCHAR(255) PRIMARY KEY,
          earned_credits BIGINT NOT NULL DEFAULT 0,
          updated_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS redemptions (
          redemption_id VARCHAR(255) PRIMARY KEY,
          account_id VARCHAR(255) NOT NULL,
          credits_burned BIGINT NOT NULL,
          usdt_amount_cents BIGINT NOT NULL,
          timestamp BIGINT NOT NULL,
          status VARCHAR(32) NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
        CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
        CREATE INDEX IF NOT EXISTS idx_tx_session ON transactions(session_id);
        CREATE INDEX IF NOT EXISTS idx_redemptions_account ON redemptions(account_id);
        CREATE INDEX IF NOT EXISTS idx_used_sigs_expires ON used_signatures(expires_at);
      `);
    } finally {
      client.release();
    }
  }

  /** Persistent replay barrier shared across all gateway cluster nodes. */
  public async claimSignature(signature: string, timestamp: number): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("DELETE FROM used_signatures WHERE expires_at < $1", [Date.now()]);
      const check = await client.query(
        "SELECT 1 FROM used_signatures WHERE signature = $1",
        [signature]
      );
      if (check.rows.length > 0) return false;

      try {
        await client.query(
          "INSERT INTO used_signatures (signature, expires_at) VALUES ($1, $2)",
          [signature, timestamp + 60_000]
        );
        return true;
      } catch {
        return false;
      }
    } finally {
      client.release();
    }
  }

  // ─── Session Management ───────────────────────────────────────────────────

  public async registerSession(
    sessionId: string,
    publicKey: string,
    ownerAccountId: string,
    quota: number
  ): Promise<SessionRecord> {
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
    const existing = await this.getSession(cleanSessionId);
    if (existing) {
      throw new Error(`Session '${cleanSessionId}' is already registered.`);
    }

    const now = Date.now();
    await this.pool.query(
      `INSERT INTO sessions (session_id, public_key, owner_account_id, total_quota, remaining_quota, created_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
      [cleanSessionId, publicKey.trim(), ownerAccountId.trim(), quota, quota, now]
    );

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

  public async getSession(sessionId: string): Promise<SessionRecord | null> {
    const res = await this.pool.query(
      `SELECT session_id, public_key, owner_account_id, total_quota, remaining_quota, created_at, status
       FROM sessions WHERE session_id = $1`,
      [sessionId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
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

  public async listSessions(): Promise<SessionRecord[]> {
    const res = await this.pool.query(`SELECT * FROM sessions ORDER BY created_at DESC`);
    return res.rows.map((row) => ({
      sessionId: row.session_id,
      publicKey: row.public_key,
      ownerAccountId: row.owner_account_id,
      totalQuota: Number(row.total_quota),
      remainingQuota: Number(row.remaining_quota),
      createdAt: Number(row.created_at),
      status: row.status,
    }));
  }

  /**
   * Deduct full authorized ceiling before upstream inference starts.
   * Uses row-level lock on sessions (FOR UPDATE semantics via conditional atomic UPDATE).
   */
  public async reserveInference(requestId: string, sessionId: string, units: number): Promise<void> {
    if (!Number.isSafeInteger(units) || units < 1) throw new Error("Invalid reservation units");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE sessions
         SET remaining_quota = (remaining_quota - ($1::bigint)),
             status = CASE WHEN remaining_quota - ($1::bigint) = 0 THEN 'exhausted' ELSE 'active' END
         WHERE session_id = $2 AND status != 'suspended' AND remaining_quota >= ($1::bigint)
         RETURNING session_id`,
        [units, sessionId]
      );

      if (result.rowCount !== 1) {
        throw new Error("Insufficient available credit for this request");
      }

      await client.query(
        `INSERT INTO inference_reservations
         (request_id, session_id, reserved_units, status, created_at)
         VALUES ($1, $2, $3, 'reserved', $4)`,
        [requestId, sessionId, units, Date.now()]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Charge observed token usage and refund unused credit atomically.
   * Acquires row-level FOR UPDATE lock on inference_reservations to prevent double-settlement.
   */
  public async settleInference(
    requestId: string,
    usedUnits: number,
    promptUnits: number,
    completionUnits: number,
    model: string,
    latencyMs: number
  ): Promise<void> {
    if (!Number.isSafeInteger(usedUnits) || usedUnits < 0) throw new Error("Invalid usage units");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const rowRes = await client.query(
        "SELECT * FROM inference_reservations WHERE request_id = $1 FOR UPDATE",
        [requestId]
      );
      const row = rowRes.rows[0];
      if (!row) throw new Error("Reservation not found");
      if (row.status === "settled") throw new Error("Reservation already settled");

      await this.applyInferenceSettlement(
        client,
        row,
        requestId,
        usedUnits,
        promptUnits,
        completionUnits,
        model,
        latencyMs
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async applyInferenceSettlement(
    client: pg.PoolClient,
    row: any,
    requestId: string,
    usedUnits: number,
    promptUnits: number,
    completionUnits: number,
    model: string,
    latencyMs: number
  ): Promise<void> {
    if (
      ![usedUnits, promptUnits, completionUnits].every((v) => Number.isSafeInteger(v) && v >= 0) ||
      !Number.isSafeInteger(promptUnits + completionUnits) ||
      promptUnits + completionUnits !== usedUnits
    ) {
      throw new Error("Invalid usage breakdown");
    }
    const reservedUnits = Number(row.reserved_units);
    if (usedUnits > reservedUnits) throw new Error("Usage exceeded reserved credit");

    const refund = reservedUnits - usedUnits;
    await client.query(
      `UPDATE sessions
       SET remaining_quota = remaining_quota + ($1::bigint),
           status = CASE WHEN status = 'suspended' THEN status WHEN remaining_quota + ($1::bigint) = 0 THEN 'exhausted' ELSE 'active' END
       WHERE session_id = $2`,
      [refund, row.session_id]
    );

    await client.query(
      "UPDATE inference_reservations SET status = 'settled', used_units = $1 WHERE request_id = $2",
      [usedUnits, requestId]
    );

    if (usedUnits > 0) {
      await client.query(
        `INSERT INTO transactions
         (tx_id, session_id, prompt_tokens, completion_tokens, cost_units, model, upstream_latency_ms, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [requestId, row.session_id, promptUnits, completionUnits, usedUnits, model, latencyMs, Date.now()]
      );
    }
  }

  /**
   * Operator-attested manual review for stalled or crashed reservations.
   */
  public async reviewReservation(requestId: string, review: ReservationReview): Promise<unknown> {
    const reject = (message: string, statusCode: number): never => {
      throw Object.assign(new Error(message), { statusCode });
    };
    if (
      review.providerWorkStopped !== true ||
      typeof review.reason !== "string" ||
      !review.reason.trim() ||
      review.reason.length > 1024 ||
      typeof review.evidenceReference !== "string" ||
      !review.evidenceReference.trim() ||
      review.evidenceReference.length > 2048 ||
      ![review.promptUnits, review.completionUnits].every((v) => Number.isSafeInteger(v) && v >= 0) ||
      !Number.isSafeInteger(review.promptUnits + review.completionUnits)
    ) {
      reject("Provide reviewed usage, reason, evidence reference and confirmation that provider work has stopped", 400);
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const rowRes = await client.query(
        "SELECT * FROM inference_reservations WHERE request_id = $1 FOR UPDATE",
        [requestId]
      );
      const row = rowRes.rows[0];
      if (!row) reject("Reservation not found", 404);
      if (row.status !== "reserved") reject("Reservation already settled", 409);
      if (Date.now() - Number(row.created_at) < RECOVERY_MIN_AGE_MS) {
        reject("Reservation is too recent to review; wait at least five minutes", 409);
      }

      const usedUnits = review.promptUnits + review.completionUnits;
      const reservedUnits = Number(row.reserved_units);
      if (usedUnits > reservedUnits) reject("Reviewed usage exceeds reserved credit", 400);

      await this.applyInferenceSettlement(
        client,
        row,
        requestId,
        usedUnits,
        review.promptUnits,
        review.completionUnits,
        "operator-reviewed",
        0
      );

      const reviewedAt = Date.now();
      await client.query(
        `INSERT INTO reservation_reviews
         (request_id, prompt_units, completion_units, reason, evidence_reference, reviewed_at, reviewer_role)
         VALUES ($1, $2, $3, $4, $5, $6, 'operator')`,
        [requestId, review.promptUnits, review.completionUnits, review.reason.trim(), review.evidenceReference.trim(), reviewedAt]
      );

      await client.query("COMMIT");
      return {
        requestId,
        usedUnits,
        refundedUnits: reservedUnits - usedUnits,
        reason: review.reason.trim(),
        evidenceReference: review.evidenceReference.trim(),
        reviewedAt,
        reviewerRole: "operator",
        verification: "operator-attested",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Auto-settle stalled reservations older than maxAgeMs (default 10 minutes).
   * Charges reserved units in the operator's favor to prevent compute theft,
   * keeping an audit record for client dispute.
   */
  public async autoSettleStalled(
    maxAgeMs: number = 10 * 60_000
  ): Promise<Array<{ requestId: string; chargedUnits: number; settledAt: number }>> {
    const cutoff = Date.now() - maxAgeMs;
    const client = await this.pool.connect();
    const settledList: Array<{ requestId: string; chargedUnits: number; settledAt: number }> = [];

    try {
      await client.query("BEGIN");
      const rowsRes = await client.query(
        "SELECT * FROM inference_reservations WHERE status = 'reserved' AND created_at < $1 FOR UPDATE",
        [cutoff]
      );

      for (const row of rowsRes.rows) {
        const reserved = Number(row.reserved_units);
        await this.applyInferenceSettlement(
          client,
          row,
          row.request_id,
          reserved,
          reserved,
          0,
          "auto-settled-stalled",
          0
        );

        const now = Date.now();
        await client.query(
          `INSERT INTO reservation_reviews
           (request_id, prompt_units, completion_units, reason, evidence_reference, reviewed_at, reviewer_role)
           VALUES ($1, $2, 0, 'Auto-settled stalled reservation: ceiling charged in operator favor', 'system/auto-settle-policy', $3, 'system-policy')`,
          [row.request_id, reserved, now]
        );

        settledList.push({ requestId: row.request_id, chargedUnits: reserved, settledAt: now });
      }

      await client.query("COMMIT");
      return settledList;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  public async listReservationReviews(): Promise<unknown[]> {
    const res = await this.pool.query(
      "SELECT * FROM reservation_reviews ORDER BY reviewed_at DESC LIMIT 100"
    );
    return res.rows;
  }

  public async getReservation(
    requestId: string
  ): Promise<{
    requestId: string;
    sessionId: string;
    reservedUnits: number;
    usedUnits: number | null;
    status: "reserved" | "settled";
  } | null> {
    const res = await this.pool.query(
      "SELECT * FROM inference_reservations WHERE request_id = $1",
      [requestId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      requestId: row.request_id,
      sessionId: row.session_id,
      reservedUnits: Number(row.reserved_units),
      usedUnits: row.used_units != null ? Number(row.used_units) : null,
      status: row.status,
    };
  }

  public async getTransaction(txId: string): Promise<TransactionRecord | null> {
    const res = await this.pool.query("SELECT * FROM transactions WHERE tx_id = $1", [txId]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      txId: r.tx_id,
      sessionId: r.session_id,
      promptTokens: Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      costUnits: Number(r.cost_units),
      model: r.model,
      upstreamLatencyMs: Number(r.upstream_latency_ms),
      timestamp: Number(r.timestamp),
    };
  }

  public async listReservations(): Promise<unknown[]> {
    const res = await this.pool.query(
      "SELECT * FROM inference_reservations WHERE status = 'reserved' ORDER BY created_at"
    );
    return res.rows;
  }

  public async topupQuota(sessionId: string, amount: number): Promise<SessionRecord> {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("Invalid top-up amount: must be a positive number.");
    }

    const res = await this.pool.query(
      `UPDATE sessions
       SET total_quota = total_quota + ($1::bigint),
           remaining_quota = remaining_quota + ($1::bigint),
           status = CASE WHEN status = 'suspended' THEN status ELSE 'active' END
       WHERE session_id = $2 AND total_quota <= ($3::bigint)
       RETURNING *`,
      [amount, sessionId, Number.MAX_SAFE_INTEGER - amount]
    );

    if (res.rowCount !== 1) {
      const existing = await this.getSession(sessionId);
      if (!existing) throw new Error(`Session '${sessionId}' not found.`);
      throw new Error("Quota exceeds safe integer range");
    }

    return (await this.getSession(sessionId))!;
  }

  public async suspendSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found.`);
    await this.pool.query("UPDATE sessions SET status = 'suspended' WHERE session_id = $1", [sessionId]);
    return { ...session, status: "suspended" };
  }

  public async resumeSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Session '${sessionId}' not found.`);
    const newStatus = session.remainingQuota > 0 ? "active" : "exhausted";
    await this.pool.query("UPDATE sessions SET status = $1 WHERE session_id = $2", [newStatus, sessionId]);
    return { ...session, status: newStatus };
  }

  // ─── Intent Registry ──────────────────────────────────────────────────────

  public async broadcastIntent(sessionId: string, model: string, maxBudget: number): Promise<IntentRecord> {
    if (!Number.isSafeInteger(maxBudget) || maxBudget <= 0) {
      throw new Error("Invalid maxBudget: must be a positive number.");
    }

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found. Register first.`);
    }

    if (session.remainingQuota <= 0) {
      throw new Error("Insufficient remaining quota to broadcast compute intent.");
    }

    const intentId = `intent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    await this.pool.query(
      `INSERT INTO intents (intent_id, session_id, model, max_budget, status, created_at)
       VALUES ($1, $2, $3, $4, 'open', $5)`,
      [intentId, sessionId, model, maxBudget, now]
    );

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

  public async fillIntent(intentId: string, solverId: string): Promise<IntentRecord> {
    const res = await this.pool.query("SELECT * FROM intents WHERE intent_id = $1", [intentId]);
    const row = res.rows[0];
    if (!row) {
      throw new Error(`Intent '${intentId}' not found.`);
    }
    if (row.status !== "open") {
      throw new Error(`Intent '${intentId}' is already ${row.status}.`);
    }

    const now = Date.now();
    await this.pool.query(
      "UPDATE intents SET status = 'filled', solver_id = $1, filled_at = $2 WHERE intent_id = $3",
      [solverId, now, intentId]
    );

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

  public async listOpenIntents(): Promise<IntentRecord[]> {
    const res = await this.pool.query(
      "SELECT * FROM intents WHERE status = 'open' ORDER BY created_at DESC"
    );
    return res.rows.map((r) => ({
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

  public async getSolverEarnings(solverId: string): Promise<number> {
    const cleanSolverId = (solverId || "").trim();
    const res = await this.pool.query(
      "SELECT earned_credits FROM solver_earnings WHERE solver_id = $1",
      [cleanSolverId]
    );
    return res.rows[0] ? Number(res.rows[0].earned_credits) : 0;
  }

  public async registerSolver(solver: SolverRecord): Promise<SolverRecord> {
    if (!solver.solverId || !solver.solverId.trim()) throw new Error("solverId is required");
    const cleanId = solver.solverId.trim();
    const endpoint = solver.endpointUrl;
    const models = JSON.stringify(solver.modelsSupported);
    const price = Number(solver.pricePerKTokens) || 0;
    const rep = Number(solver.reputationScore) || 0;
    const active = solver.isActive !== false ? 1 : 0;

    await this.pool.query(
      `INSERT INTO solvers (solver_id, endpoint_url, models_supported, price_per_k_tokens, reputation_score, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (solver_id) DO UPDATE SET
         endpoint_url = EXCLUDED.endpoint_url,
         models_supported = EXCLUDED.models_supported,
         price_per_k_tokens = EXCLUDED.price_per_k_tokens,
         is_active = EXCLUDED.is_active`,
      [cleanId, endpoint, models, price, rep, active]
    );

    return (await this.getSolver(cleanId))!;
  }

  public async getSolver(solverId: string): Promise<SolverRecord | null> {
    const res = await this.pool.query("SELECT * FROM solvers WHERE solver_id = $1", [solverId.trim()]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    let models: string[] = [];
    try {
      models = JSON.parse(row.models_supported);
    } catch {
      models = [row.models_supported];
    }
    return {
      solverId: row.solver_id,
      endpointUrl: row.endpoint_url,
      modelsSupported: models,
      pricePerKTokens: Number(row.price_per_k_tokens),
      reputationScore: Number(row.reputation_score),
      isActive: Boolean(row.is_active),
    };
  }

  public async listSolvers(): Promise<SolverRecord[]> {
    const res = await this.pool.query("SELECT * FROM solvers ORDER BY solver_id");
    return res.rows.map((row) => {
      let models: string[] = [];
      try {
        models = JSON.parse(row.models_supported);
      } catch {
        models = [row.models_supported];
      }
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

  public async setSolverActive(solverId: string, isActive: boolean): Promise<void> {
    await this.pool.query("UPDATE solvers SET is_active = $1 WHERE solver_id = $2", [
      isActive ? 1 : 0,
      solverId.trim(),
    ]);
  }

  public async listRedemptions(limit: number = 20): Promise<any[]> {
    const res = await this.pool.query(
      `SELECT redemption_id, account_id, credits_burned, usdt_amount_cents, timestamp, status
       FROM redemptions
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit]
    );

    return res.rows.map((r) => ({
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

  public async getTransactionHistory(sessionId: string): Promise<TransactionRecord[]> {
    const res = await this.pool.query(
      "SELECT * FROM transactions WHERE session_id = $1 ORDER BY timestamp DESC",
      [sessionId]
    );

    return res.rows.map((r) => ({
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

  public async listRecentTransactions(limit: number = 50): Promise<TransactionRecord[]> {
    const res = await this.pool.query(
      "SELECT * FROM transactions ORDER BY timestamp DESC LIMIT $1",
      [limit]
    );

    return res.rows.map((r) => ({
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

  public async close(): Promise<void> {
    if (!this.isExternalPool) {
      await this.pool.end();
    }
  }
}
