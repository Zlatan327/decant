/** Explicit local harness: isolated test credits, real configured provider, no chain settlement. */
import "dotenv/config";
import { DecantGatewayServer } from "../gateway/src/server.js";
import { DecantClient } from "../agent-sdk/src/client.js";

const gateway = new DecantGatewayServer({ port: 0, dbPath: ":memory:" });
try {
  if (!gateway.compute.configured) throw new Error("Configure a real inference provider and model in .env first");
  const port = await gateway.start();
  const client = new DecantClient({ gatewayUrl: `http://127.0.0.1:${port}`, maxOutputUnits: 128 });
  gateway.ledger.registerSession(client.sessionId, client.publicKey, "local-harness", 1000);
  console.log("Local harness: 1,000 test credits in an isolated in-memory ledger. No NEAR or USDT transaction.");
  const result = await client.streamChat("Explain compute access credits in simple terms", token => process.stdout.write(token));
  if (result.status !== 200) throw new Error(`Inference failed with HTTP ${result.status}: ${result.fullText}`);
  const detail = await client.getSessionInfo();
  console.log(`\nAvailable test credit: ${detail.session.remainingQuota}; usage records: ${detail.transactions.length}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (gateway.server.listening) await gateway.stop(); else gateway.ledger.close();
}
