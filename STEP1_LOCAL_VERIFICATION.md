# Step 1: Local End-to-End Verification Checklist

This tracking document guides you through validating the **Decant Decentralized Compute Gateway**, the **Operator Console UI**, and **Live Gemini AI Streaming** on your local machine.

Both the gateway server and dashboard are running in the background.

---

## 🚀 Live Local Endpoints & Credentials

| Component | URL / Value | Description |
| :--- | :--- | :--- |
| **Dashboard UI** | [http://localhost:3000](http://localhost:3000) | Operator Console & Stream Playground |
| **Gateway Proxy** | [http://127.0.0.1:8080](http://127.0.0.1:8080) | High-throughput reverse proxy & ACID ledger |
| **Gateway Health** | [http://127.0.0.1:8080/health](http://127.0.0.1:8080/health) | Live runtime diagnostic probe |
| **Operator Admin Key** | `5936c9888d1fd329b49f1d0b34c3a4b6803bf9b0aec1e99008d82ee8d28c4bcc` | Unlocks operator mutations & ledger audit |
| **Active Provider Model** | `gemini-3.5-flash` | Live Google Gemini streaming model |
| **Deployed NEAR Contract** | [`shylibrary4027.testnet`](https://testnet.nearblocks.io/address/shylibrary4027.testnet) | Live on-chain quota & intent registry |

---

## 📋 Verification Checklist

Mark each checkbox `[x]` as you test each capability.

### 1. Gateway Runtime Health
- [x] **Gateway Server Started**: Running on `http://127.0.0.1:8080` (PID managed).
- [x] **Database Seeded**: Persistent SQLite initialized at `data/decant.db` with active and depleted demo sessions.
- [x] **Health Check Verified**: `/health` reports `status: healthy`, `inferenceConfigured: true`, `models: [gemini-3.5-flash]`, and `ledger: sqlite-acid-persistent`.

### 2. Browser Dashboard Navigation
- [ ] **Open Dashboard**: Navigate to [http://localhost:3000](http://localhost:3000) in your browser.
- [ ] **Check Health Badge**: Top navigation bar should display a green `HEALTHY` pill with `127.0.0.1:8080`.
- [ ] **Explore "How to Use" Tab**:
  - Click **How to Use** in the left sidebar nav.
  - Review the **Operator Console vs. Autonomous Agent** two-sided platform architecture.
  - Click through the 6 workflow step cards (Session Keygen, NEAR Staking, Operator Connect, Prompt Stream, Atomic Debit, Accounting).
  - Verify quick-action routing buttons (e.g. *Inspect Sessions*, *Launch Inference*, *Review Ledger*).

### 3. Operator Authentication
- [ ] **Connect Operator Key**:
  - In the top navigation bar, locate the **Operator Key** input field.
  - Paste your key:
    ```
    5936c9888d1fd329b49f1d0b34c3a4b6803bf9b0aec1e99008d82ee8d28c4bcc
    ```
  - Click **Connect**.
  - Verify the indicator turns green: **Operator Connected (Memory-Only)**.

### 4. Agent Session Inspection
- [ ] **Navigate to "Sessions" Tab**:
  - Click **Sessions** in the sidebar.
  - Verify `agent-alpha-demo` is visible with `85 / 100` remaining quota units (`active`).
  - Verify `agent-depleted-demo` is visible with `0 / 25` remaining quota units (`exhausted`).

### 5. Live AI Inference Streaming (Real Gemini 3.5 Flash)
- [ ] **Navigate to "Inference" Tab**:
  - Click **Inference** in the sidebar.
  - Select session: `agent-alpha-demo`.
  - Select model: `gemini-3.5-flash`.
  - Select or enter a prompt:
    > *"Explain the advantage of Decant credit routing"*
  - Click **Stream Request**.
- [ ] **Observe Live Streaming**:
  - Watch tokens render in real time in the terminal box without simulated fallback.
  - Note response model reported: `gemini-3.5-flash`.
  - Check the round-trip latency (e.g. ~700-1200ms) and response headers.

### 6. Balance Reservation & Atomic Deduction
- [ ] **Verify Quota Consumption**:
  - Check `agent-alpha-demo` balance after inference.
  - Notice the quota decreased proportionally to characters generated (`ceil(chars / 4)`).
  - Confirm available credit updated on screen without needing a hard page refresh.

### 7. Persistent Accounting & Audit Ledger
- [ ] **Navigate to "Ledger" Tab**:
  - Click **Ledger** in the sidebar.
  - Confirm the newly completed inference appears at the top of the transaction history.
  - Check fields: timestamp, session ID, tokens deducted, latency (ms), and model ID.
  - Verify the SQLite database `data/decant.db` has recorded this permanently.

### 8. Circuit Breaker & Quota Enforcement (HTTP 402)
- [ ] **Attempt Inference with Depleted Session**:
  - Return to **Inference**.
  - Switch session to `agent-depleted-demo` (0 remaining quota).
  - Click **Stream Request**.
  - Confirm the gateway halts the request immediately with **HTTP 402 Payment Required: Insufficient compute quota**.
- [ ] **Top-Up Session (Operator Action)**:
  - In **Sessions**, click **Top-up Quota** for `agent-depleted-demo`.
  - Add `50` units.
  - Verify status switches from `exhausted` to `active` with 50 available units.

---

## 🛠️ CLI Quick Test (Optional Headless Validation)

If you prefer testing from your terminal alongside the browser:

```powershell
# 1. Probe health
Invoke-RestMethod -Uri http://127.0.0.1:8080/health

# 2. Run automated live simulator (real Gemini inference + token debit)
npm run simulate

# 3. Query on-chain quota from the live NEAR contract
node -e "
const { JsonRpcProvider } = require('near-api-js');
const provider = new JsonRpcProvider({ url: 'https://test.rpc.fastnear.com' });
provider.query({
  request_type: 'call_function',
  account_id: 'shylibrary4027.testnet',
  method_name: 'get_quota',
  args_base64: Buffer.from(JSON.stringify({ session_id: 'agent-production-01' })).toString('base64'),
  finality: 'final'
}).then(r => console.log(JSON.parse(Buffer.from(r.result).toString())));
"
```

---

## 🏁 Completion Criteria

Once all items above are checked, **Step 1 (Local Visual & E2E Validation)** is complete. 

Proceed to **Step 2 (Cloud Production Deployment)**:
1. Containerize or package Gateway for Railway / Render / Fly.io with SQLite persistent storage.
2. Deploy Dashboard to Vercel / Cloudflare Pages with `VITE_DECANT_API_BASE_URL`.
