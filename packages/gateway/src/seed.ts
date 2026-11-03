/**
 * seed.ts — Seed the Decant SQLite database with sample demo records.
 *
 * Populates:
 *   - 2 agent sessions (one active with 100 quota, one depleted with 0 quota).
 *   - 2 compute intents (one open, one filled by a DePIN solver).
 *   - 2 audit transactions demonstrating token deduction and latency telemetry.
 *
 * Usage: npm run seed
 */

import { DecantLedger } from "./db.js";

const dbPath = process.env["DATABASE_PATH"] ?? "data/decant.db";
console.log(`[decant-seed] Seeding database at: ${dbPath}`);

const ledger = new DecantLedger(dbPath);

try {
  // 1. Seed Active Agent Session
  const activeSessionId = "agent-alpha-demo";
  const existingActive = ledger.getSession(activeSessionId);
  if (!existingActive) {
    ledger.registerSession(
      activeSessionId,
      "ed25519:6Qp7qF8Y7Q5E1V3Xk8bM9P2R4T6W8Z1A3C5E7G9J2L4N",
      "alpha-agent.testnet",
      100
    );
    console.log(`  ✔ Seeded active session: ${activeSessionId} (100 compute units)`);
  } else {
    console.log(`  ℹ Session ${activeSessionId} already exists`);
  }

  // 2. Seed Depleted Agent Session (for demonstrating HTTP 402 circuit breaker)
  const depletedSessionId = "agent-depleted-demo";
  const existingDepleted = ledger.getSession(depletedSessionId);
  if (!existingDepleted) {
    ledger.registerSession(
      depletedSessionId,
      "ed25519:4Kn9wL2P5R7T9V1X3Z5B7D9F1H3J5L7N9P2R4T6W8Z1A",
      "depleted-agent.testnet",
      25
    );
    // Drain balance to 0
    ledger.deductQuota(
      depletedSessionId,
      25,
      10,
      15,
      "meta-llama/Meta-Llama-3-8B-Instruct",
      142
    );
    console.log(`  ✔ Seeded exhausted session: ${depletedSessionId} (0 quota remaining — triggers 402)`);
  } else {
    console.log(`  ℹ Session ${depletedSessionId} already exists`);
  }

  // 3. Seed Sample Compute Intents
  const intents = ledger.listOpenIntents();
  if (intents.length === 0) {
    const intent1 = ledger.broadcastIntent(
      activeSessionId,
      "meta-llama/Meta-Llama-3-8B-Instruct",
      50
    );
    console.log(`  ✔ Broadcasted open compute intent: ${intent1.intentId}`);

    const intent2 = ledger.broadcastIntent(
      activeSessionId,
      "gemini-3.8-flash",
      75
    );
    ledger.fillIntent(intent2.intentId, "hyperbolic-solver-cluster.near");
    console.log(`  ✔ Seeded filled compute intent: ${intent2.intentId} (solver: hyperbolic-solver-cluster.near)`);
  }

  // 4. Seed Transaction for active session
  const txs = ledger.getTransactionHistory(activeSessionId);
  if (txs.length === 0) {
    ledger.deductQuota(
      activeSessionId,
      15,
      8,
      7,
      "meta-llama/Meta-Llama-3-8B-Instruct",
      186
    );
    console.log(`  ✔ Seeded initial audit transaction for ${activeSessionId} (-15 tokens)`);
  }

  console.log("\n✨ Database seeded successfully. Restart or refresh dashboard to view pre-loaded state.");
} catch (err: any) {
  console.error("[decant-seed] Error seeding database:", err.message);
} finally {
  ledger.close();
}
