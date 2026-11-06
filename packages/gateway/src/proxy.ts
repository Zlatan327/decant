import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import dotenv from "dotenv";

const rootEnv = resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else {
  dotenv.config();
}

/**
 * proxy.ts — Decant Production Reverse Proxy & Gateway Entry Point.
 *
 * Boots the high-throughput Decant Gateway Server with persistent SQLite
 * ledger accounting, anti-hallucination policy filtering, and real AI model routing.
 */

import { DecantGatewayServer } from "./server.js";

const PORT = parseInt(process.env["PORT"] ?? "8080", 10);
const rawDbPath = process.env["DATABASE_PATH"] ?? "data/decant.db";
const DB_PATH = isAbsolute(rawDbPath)
  ? rawDbPath
  : resolve(import.meta.dirname, "../../..", rawDbPath);

const gateway = new DecantGatewayServer({
  port: PORT,
  dbPath: DB_PATH,
});

gateway.start(process.env["HOST"] ?? "127.0.0.1").catch((err) => {
  console.error("[gateway] startup error:", err);
  process.exit(1);
});

export const server = gateway.server;
export default gateway;
