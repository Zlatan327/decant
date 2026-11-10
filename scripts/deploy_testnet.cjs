/**
 * deploy_testnet.cjs — Deploy Decant NEAR smart contract to Testnet
 */
const fs = require('fs');
const path = require('path');
const { Account, KeyPair, KeyPairSigner } = require('near-api-js');
const { parseSeedPhrase } = require('near-seed-phrase');

async function main() {
  const seedPhrase = process.env.NEAR_SEED_PHRASE;
  const privateKey = process.env.NEAR_PRIVATE_KEY;
  const accountId = process.env.NEAR_ACCOUNT_ID || "shylibrary4027.testnet";
  const rpcUrl = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";

  if (!accountId?.endsWith(".testnet")) {
    throw new Error("Set NEAR_ACCOUNT_ID to the intended .testnet deployment account");
  }
  if (!seedPhrase && !privateKey) {
    throw new Error("Please set NEAR_SEED_PHRASE or NEAR_PRIVATE_KEY environment variable");
  }

  console.log(`\n1. Initializing deployer for account: ${accountId}`);
  let secretKey;
  if (seedPhrase) {
    const parsed = parseSeedPhrase(seedPhrase);
    secretKey = parsed.secretKey;
  } else {
    secretKey = privateKey;
  }
  const keyPair = KeyPair.fromString(secretKey);
  const signer = new KeyPairSigner(keyPair);
  const account = new Account(accountId, rpcUrl, signer);

  const balance = await account.getBalance();
  console.log(`Account balance: ${Number(BigInt(balance) / 10n**22n) / 100} NEAR`);

  const wasmPath = path.resolve(__dirname, '../packages/contracts/target/wasm32-unknown-unknown/release/decant_contracts.wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM file not found at ${wasmPath}. Run npm run build:contracts first.`);
  }

  const wasmBytes = fs.readFileSync(wasmPath);
  console.log(`\n2. Deploying contract WASM (${(wasmBytes.length / 1024).toFixed(1)} KB) to ${accountId}...`);

  const deployResult = await account.deployContract(wasmBytes);
  console.log(`   Transaction hash: ${deployResult.transaction.hash}`);
  console.log(`   Contract deployment succeeded!`);

  console.log(`\n3. Checking contract initialization with owner: ${accountId}...`);
  try {
    const initResult = await account.callFunction({
      contractId: accountId,
      methodName: "new",
      args: { owner: accountId },
      gas: "30000000000000",
    });
    console.log(`   Contract initialized successfully! Transaction hash: ${initResult.transaction.hash}`);
  } catch (err) {
    if (err.message && err.message.includes("The contract has already been initialized")) {
      console.log(`   Contract was already initialized. State preserved.`);
    } else {
      console.log(`   Initialization skipped or already active: ${err.message}`);
    }
  }

  console.log(`\n4. Verifying contract deployment via RPC query...`);
  const viewRes = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "verify",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: accountId,
        method_name: "list_open_intents",
        args_base64: Buffer.from("{}").toString("base64")
      }
    })
  });

  const viewJson = await viewRes.json();
  if (viewRes.ok && Array.isArray(viewJson.result?.result)) {
    const output = Buffer.from(viewJson.result.result).toString("utf-8");
    console.log(`   On-chain view query result (open intents): ${output}`);
  } else {
    throw new Error("Could not verify the deployed contract through the testnet RPC");
  }

  console.log(`\n5. Updating .env with contract details...`);
  const envPath = path.resolve(__dirname, '../.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  for (const [key, value] of Object.entries({
    NEAR_CONTRACT_ID: accountId,
    NEAR_RPC_URL: rpcUrl,
    VITE_DECANT_NEAR_CONTRACT_ID: accountId,
  })) {
    const entry = new RegExp(`^${key}=.*$`, 'm');
    envContent = entry.test(envContent)
      ? envContent.replace(entry, () => `${key}=${value}`)
      : `${envContent.trimEnd()}\n${key}=${value}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`   .env updated successfully.`);
  console.log(`\nDeployment verification complete for ${accountId}!`);
}

main().catch(err => {
  console.error("\nDeployment failed:", err.message);
  process.exit(1);
});
