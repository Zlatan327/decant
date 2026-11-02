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

      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
      CREATE INDEX IF NOT EXISTS idx_tx_session ON transactions(session_id);
    `);
  }

  // ─── Session Management ───────────────────────────────────────────────────

  public registerSession(
    sessionId: string,
    publicKey: string,
    ownerAccountId: string,
    quota: number
  ): SessionRecord {
    const existing = this.getSession(sessionId);
    if (existing) {
      throw new Error(`Session '${sessionId}' is already registered.`);
    }

    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO sessions (session_id, public_key, owner_account_id, total_quota, remaining_quota, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `);

    stmt.run(sessionId, publicKey, ownerAccountId, quota, quota, now);
    return {
      sessionId,
      publicKey,
      ownerAccountId,
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

  public deductQuota(
    sessionId: string,
    costUnits: number,
    promptTokens: number,
    completionTokens: number,
    model: string,
    latencyMs: number
  ): { remainingQuota: number; txId: string } {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    if (session.remainingQuota < costUnits) {
      throw new Error(
        `Insufficient credit: remaining ${session.remainingQuota}, required ${costUnits}`
      );
    }

    const newRemaining = session.remainingQuota - costUnits;
    const newStatus = newRemaining === 0 ? "exhausted" : "active";
    const now = Date.now();
    const txId = `tx_${now}_${Math.random().toString(36).substring(2, 9)}`;

    // Atomic SQLite update transaction
    this.db.exec("BEGIN IMMEDIATE TRANSACTION;");
    try {
      this.db
        .prepare(`UPDATE sessions SET remaining_quota = ?, status = ? WHERE session_id = ?`)
        .run(newRemaining, newStatus, sessionId);

      this.db
        .prepare(`
          INSERT INTO transactions (tx_id, session_id, prompt_tokens, completion_tokens, cost_units, model, upstream_latency_ms, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(txId, sessionId, promptTokens, completionTokens, costUnits, model, latencyMs, now);

      this.db.exec("COMMIT;");
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }

    return { remainingQuota: newRemaining, txId };
  }

  public topupQuota(sessionId: string, amount: number): SessionRecord {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found.`);
    }

    const newTotal = session.totalQuota + amount;
    const newRemaining = session.remainingQuota + amount;

    this.db
      .prepare(`UPDATE sessions SET total_quota = ?, remaining_quota = ?, status = 'active' WHERE session_id = ?`)
      .run(newTotal, newRemaining, sessionId);

    return this.getSession(sessionId)!;
  }

  // ─── Intent Registry ──────────────────────────────────────────────────────

  public broadcastIntent(sessionId: string, model: string, maxBudget: number): IntentRecord {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' not found. Register first.`);
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
