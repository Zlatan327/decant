#!/usr/bin/env node
/**
 * keygen.mjs — Create a genuine Ed25519 agent identity from the terminal.
 *
 * Usage:
 *   node scripts/keygen.mjs
 *   npm run keygen
 *
 * Prints:
 *   - Session ID (derived from the public key, matches DecantClient defaults)
 *   - Ed25519 Public Key (for registering on the gateway)
 *   - Ed25519 Private Key (for the agent to sign requests)
 *   - Ready-to-use TypeScript snippet for @decant/agent-sdk
 */

import { generateKeyPairSync } from "node:crypto";
import { KeyPair } from "near-api-js";

function generate() {
  const keyPair = KeyPair.fromRandom("ed25519");
  const publicKey = keyPair.getPublicKey().toString();
  const privateKey = keyPair.toString();
  const sessionId = publicKey.replace("ed25519:", "").slice(0, 32);

  console.log("\n=======================================================");
  console.log("       DECANT AGENT IDENTITY GENERATED                ");
  console.log("=======================================================\n");
  console.log(`Session ID  : ${sessionId}`);
  console.log(`Public Key  : ${publicKey}`);
  console.log(`Private Key : ${privateKey}\n`);
  console.log("-------------------------------------------------------");
  console.log("1. Register this session with the operator:");
  console.log(`   curl -X POST http://127.0.0.1:8080/v1/sessions/register \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -H "X-Decant-Admin-Key: <OPERATOR_KEY>" \\`);
  console.log(`     -d '{"sessionId": "${sessionId}", "publicKey": "${publicKey}", "quota": 500}'\n`);
  console.log("2. Use this in your autonomous AI agent code:");
  console.log("-------------------------------------------------------");
  console.log(`import { DecantClient } from "@decant/agent-sdk";

const client = new DecantClient({
  gatewayUrl: "http://127.0.0.1:8080",
  sessionId: "${sessionId}",
  privateKey: "${privateKey}",
  maxOutputUnits: 128,
});

const stream = await client.streamChat("Hello from autonomous agent!", (token) => {
  process.stdout.write(token);
});
console.log("\\nCredit used:", stream.usage?.credit_units);
`);
  console.log("=======================================================\n");
}

generate();
