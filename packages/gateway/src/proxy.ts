/**
 * proxy.ts — Decant Production Reverse Proxy & Gateway Entry Point.
 *
 * Boots the high-throughput Decant Gateway Server with persistent SQLite
 * ledger accounting, anti-hallucination policy filtering, and real AI model routing.
 */

import { DecantGatewayServer } from "./server.js";

const PORT = parseInt(process.env["PORT"] ?? "8080", 10);
const DB_PATH = process.env["DATABASE_PATH"] ?? "data/decant.db";

const gateway = new DecantGatewayServer({
  port: PORT,
  dbPath: DB_PATH,
});

gateway.start().catch((err) => {
  console.error("[gateway] startup error:", err);
  process.exit(1);
});

export const server = gateway.server;
export default gateway;
