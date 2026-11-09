import { DatabaseSync } from "node:sqlite";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Account, KeyPair, KeyPairSigner } from "near-api-js";

const root = fileURLToPath(new URL("../", import.meta.url));
dotenv.config({ path: resolve(root, ".env"), quiet: true });

async function main() {
  const [requestId] = process.argv.slice(2);
  if (!requestId || process.argv.length !== 3) {
    throw new Error("Usage: npm run settle:testnet -- <ledger-transaction-id>");
  }

  const { NEAR_CONTRACT_ID: contractId, NEAR_ACCOUNT_ID: signerId,
    NEAR_SETTLEMENT_PRIVATE_KEY: privateKey } = process.env;
  if (!contractId?.endsWith(".testnet") || !signerId?.endsWith(".testnet") || !privateKey) {
    throw new Error("Configure NEAR_CONTRACT_ID, NEAR_ACCOUNT_ID and NEAR_SETTLEMENT_PRIVATE_KEY for Testnet.");
  }

  const databasePath = process.env.DATABASE_PATH || "data/decant.db";
  if (databasePath === ":memory:") throw new Error("Settlement requires the gateway’s persistent ledger.");
  const db = new DatabaseSync(isAbsolute(databasePath) ? databasePath : resolve(root, databasePath), { readOnly: true });
  let debit;
  try {
    debit = db.prepare(`
      SELECT t.session_id, t.cost_units
      FROM transactions t JOIN inference_reservations r
        ON r.request_id = t.tx_id AND r.session_id = t.session_id AND r.used_units = t.cost_units
      WHERE t.tx_id = ? AND r.status = 'settled' AND t.cost_units > 0
    `).get(requestId);
  } finally {
    db.close();
  }
  if (!debit || !Number.isSafeInteger(debit.cost_units)) {
    throw new Error("No matching settled inference debit in the configured ledger.");
  }

  const rpc = "https://test.rpc.fastnear.com";
  const account = new Account(signerId, rpc, new KeyPairSigner(KeyPair.fromString(privateKey)));
  const outcome = await account.callFunctionRaw({
    contractId,
    methodName: "settle_inference",
    args: { request_id: requestId, session_id: debit.session_id, amount: debit.cost_units },
    waitUntil: "FINAL",
  });
  const success = outcome.status?.SuccessValue;
  if (typeof success !== "string") throw new Error("NEAR did not return a successful execution outcome.");
  const applied = JSON.parse(Buffer.from(success, "base64").toString("utf8"));
  const receipt = outcome.receipts_outcome.find(entry =>
    entry.outcome.executor_id === contractId && entry.outcome.status?.SuccessValue === success);
  if (typeof applied !== "boolean" || !receipt || !outcome.transaction?.hash) {
    throw new Error("NEAR did not return a matching settlement receipt.");
  }

  console.log(JSON.stringify({
    requestId, sessionId: debit.session_id, credits: debit.cost_units, contractId, signerId,
    applied, transactionHash: outcome.transaction.hash, receiptId: receipt.id,
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
