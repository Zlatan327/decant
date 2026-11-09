# Step 1: Local End-to-End Verification Checklist

This tracking document guides you through validating the **Decant Decentralized Compute Gateway**, the **Operator Console UI**, **Web3 Wallet & Operator Logins**, and **Multi-Model Gemini AI Streaming** on your local machine.

Both the gateway server and dashboard are running in the background.

---

## 🚀 Live Local Endpoints & Credentials

| Component | URL / Value | Description |
| :--- | :--- | :--- |
| **Dashboard UI** | [http://localhost:3000](http://localhost:3000) | Operator Console & Stream Playground |
| **Gateway Proxy** | [http://127.0.0.1:8080](http://127.0.0.1:8080) | High-throughput reverse proxy & ACID ledger |
| **Gateway Health** | [http://127.0.0.1:8080/health](http://127.0.0.1:8080/health) | Live runtime diagnostic probe |
| **Operator Admin Key** | `YOUR_DECANT_ADMIN_KEY` | Unlocks operator mutations & ledger audit |
| **Supported AI Models** | `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.8-flash` | Live Google Gemini streaming models |
| **Deployed NEAR Contract** | [`shylibrary4027.testnet`](https://testnet.nearblocks.io/address/shylibrary4027.testnet) | Live on-chain quota & intent registry |
| **Testnet Account ID** | `shylibrary4027.testnet` | 11.99 NEAR funded testnet account |

---

## 📋 Verification Checklist

Mark each checkbox `[x]` as you test each capability.

### 1. Gateway Runtime Health
- [x] **Gateway Server Started**: Running on `http://127.0.0.1:8080` (PID managed).
- [x] **Database Seeded**: Persistent SQLite initialized at `data/decant.db` with active and depleted demo sessions.
- [x] **Multi-Model Health Verified**: `/health` reports `status: healthy`, `inferenceConfigured: true`, `models: [gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.8-flash]`, and `ledger: sqlite-acid-persistent`.

### 2. Browser Dashboard Navigation
- [ ] **Open Dashboard**: Navigate to [http://localhost:3000](http://localhost:3000) in your browser.
- [ ] **Check Health Badge**: Top navigation bar displays a green `HEALTHY` pill with gateway status.
- [ ] **Explore "How to Use" Tab**:
  - Click **How to Use** in the sidebar.
  - Review the **Operator Console vs. Autonomous Agent** two-sided platform architecture.
  - Click through the 6 workflow step cards and action buttons.

### 3. Comprehensive Authentication & Logins ("Connect Identity / Wallet")
- [ ] **Open Auth Modal**:
  - In the top navigation bar, click the **⚡ Connect Identity / Wallet** pill.
- [ ] **Test NEAR account lookup**:
  - In the **NEAR Account Lookup** tab, click **Connect shylibrary4027.testnet (Deployed Contract)** shortcut.
  - Notice real-time FastNEAR RPC query fetching live balance: `11.99 NEAR`.
  - Notice on-chain quota inspection: `agent-production-01` (`5,000 / 5,000 units`).
  - Notice top bar pill updates to: `Ⓝ shylibrary4027.testnet (11.99 N)`.
- [ ] **Test Operator Admin Sign-In**:
  - Open modal again, switch to **🛡️ Operator Admin** tab.
  - Enter the key configured in the gateway environment and click **Authenticate**.
  - Notice top bar updates to: `🛡️ Operator Active`.
- [ ] **Test Disconnect / Switch Role**:
  - Open modal and click **Disconnect** to verify clean state reset to Guest mode.

### 4. 1-Click Ed25519 Agent Keypair Generator
- [ ] **Navigate to "Sessions" Tab**:
  - Click **Sessions** in the sidebar.
  - Open the **Register a session** accordion.
  - Click **⚡ Generate Ed25519 Keypair**.
  - Verify native Web Crypto generates a valid Base58 public key (`ed25519:...`) and session ID.
  - Verify the private key card appears with a **Copy** button and a reminder that private keys never leave the client.

### 5. Multi-Model Selection & Inference Playground
- [ ] **Navigate to "Inference" Tab**:
  - Notice the **Model Selection Cards**:
    - `⚡ Gemini 3.5 Flash` (Recommended · High Speed)
    - `🚀 Gemini 3.5 Flash Lite` (Edge Optimized · Ultra-low latency)
    - `🧠 Gemini 3.8 Flash` (Next-Gen Reasoning)
    - `🛠️ Custom Model / DePIN` (Custom upstream endpoint)
  - Click **Gemini 3.5 Flash Lite** card and verify active badge updates.
- [ ] **Adjust Output Parameters**:
  - Move the **Max Tokens** slider (e.g. set to `64` or `128` units).
  - Move the **Temperature** slider (e.g. `0.7`).
- [ ] **Test Live Streaming**:
  - Select session: `agent-alpha-demo`.
  - Click prompt chip: `⚡ Decant routing` or `🛡️ Solidity contract`.
  - Click **Stream Live Request**.
  - Watch tokens render progressively with blinking cursor.
  - Verify message is saved into the conversational **Thread History** with latency & token stats!

### 6. Balance Reservation & Atomic Deduction
- [ ] **Verify Quota Consumption**:
  - Check `agent-alpha-demo` balance after inference.
  - Notice remaining quota decreased by the exact credit units observed.
  - Check the telemetry strip: latency ms, tokens/sec throughput, and quota response header.

### 7. Persistent Accounting & Audit Ledger
- [ ] **Navigate to "Ledger" Tab**:
  - Click **Ledger** in the sidebar.
  - Confirm the newly completed inference appears at the top of the transaction history with the selected model ID (`gemini-3.5-flash-lite`).
  - Verify the SQLite database `data/decant.db` has recorded this permanently.

### 8. Circuit Breaker & Quota Enforcement (HTTP 402)
- [ ] **Attempt Inference with Depleted Session**:
  - Return to **Inference**.
  - Switch session to `agent-depleted-demo` (0 remaining quota).
  - Click **Stream Live Request**.
  - Confirm the gateway halts the request immediately with **HTTP 402 Payment Required: Insufficient compute quota**.
- [ ] **Top-Up Session (Operator Action)**:
  - In **Sessions**, click **Top-up Quota** for `agent-depleted-demo`.
  - Add `50` units.
  - Verify status switches from `exhausted` to `active` with 50 available units.

### 9. On-Chain NEAR Contract Inspector
- [ ] **Inspect Live Contract**:
  - In **Overview** or **Routing**, inspect the **NEAR Testnet Smart Contract** card.
  - Click **Query Contract** for `agent-production-01`.
  - Verify live RPC response: `5000 / 5000 units` owned by `shylibrary4027.testnet`.
  - Click the NearBlocks Explorer link to open the contract on-chain.

---

## 🛠️ CLI Quick Test (Optional Headless Validation)

```powershell
# 1. Probe health showing all enabled models
Invoke-RestMethod -Uri http://127.0.0.1:8080/health

# 2. Test live streaming with gemini-3.5-flash-lite
Invoke-RestMethod -Uri http://127.0.0.1:8080/v1/chat/completions -Method Post -Headers @{
  "X-Decant-Admin-Key"="YOUR_DECANT_ADMIN_KEY";
  "X-Decant-Session"="agent-alpha-demo";
  "Content-Type"="application/json"
} -Body '{"model":"gemini-3.5-flash-lite","max_tokens":40,"messages":[{"role":"user","content":"Say hi in 3 words"}]}'
```

---

## 🏁 Completion Criteria

Once all items above are checked, **Step 1 (Local Visual & E2E Validation)** is completely hardened and verified.

Proceed to **Step 2 (Cloud Production Deployment)**:
1. Containerize or package Gateway for Railway / Render / Fly.io with SQLite persistent storage.
2. Deploy Dashboard to Vercel / Cloudflare Pages with `VITE_DECANT_API_BASE_URL`.
