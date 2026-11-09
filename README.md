# Decant

Decant is a compute-access gateway for AI agents. An operator allocates session credits; agents sign requests; the gateway reserves credit before calling a configured AI provider and records usage in SQLite. The React console manages sessions, requests, intent assignments, and usage records.

**Current boundary:** gateway accounting is local SQLite. A Rust NEAR contract is included, but the running gateway does not submit or reconcile contract transactions. Verified solver rewards and USDT transfers are not connected. Those write routes fail without minting rewards or burning credits. There is no scripted successful-inference fallback.

## Requirements and local setup

- Node.js 24 or later and npm.
- A provider endpoint/model you are authorized to use, or a Gemini key and model.
- Rust/Cargo and the `wasm32-unknown-unknown` target for contract checks/builds.

```sh
npm ci
cp .env.example .env
```

Set a strong `DECANT_ADMIN_KEY` in `.env`. Configure `UPSTREAM_BASE_URL` and `UPSTREAM_MODEL`, with `UPSTREAM_API_KEY` when the provider requires it. Alternatively configure `GEMINI_API_KEY` and `GEMINI_MODEL`. Do not commit credentials. The gateway CLI loads the root `.env`; programmatic consumers configure the process environment themselves.

```sh
npm run dev:gateway
# In a second terminal:
npm run dev:dashboard


```

Open `http://localhost:3000`. Enter the operator key in the console, then register a session using an agent's Ed25519 public key and a positive integer credit allowance. Select a session and run inference. The model selector uses the gateway's configured model list. Session registration and topups are operator allocations, not purchases or on-chain deposits.

The operator key stays in memory during the page visit. It is not saved in browser storage or built into frontend assets. Use HTTPS for remote access. For deployment, set `HOST=0.0.0.0` behind your HTTPS proxy and provide durable storage for `DATABASE_PATH`.

The Vite development proxy forwards `/v1` to the gateway. For a separately hosted frontend set `VITE_DECANT_API_BASE_URL` to the gateway HTTPS URL and `CORS_ORIGINS` to the frontend origin. Never place a secret in a `VITE_` variable.

## Console walkthrough and user experience

The Decant dashboard (`packages/dashboard`) is an operator console and live telemetry interface for monitoring gateway health, managing agent credentials, testing inference streaming, and auditing ledger records.

### 1. Gateway health and operator connection (Overview)
- **Telemetry bar:** Displays real-time gateway status (`HEALTHY` / `CONNECTING` / `OFFLINE`), observed ping latency, active configured models (e.g. `gemini-3.5-flash`), and SQLite ledger connectivity.
- **Operator credential:** Click **Connect Operator** in the header to enter `DECANT_ADMIN_KEY`. The credential is kept strictly in React memory for the session and is never persisted to `localStorage` or leaked to frontend builds.
- **Theme toggle:** Switch between editorial light mode and deep atmospheric dark mode with persistent browser preference.

### 2. Cryptographic session enrollment (Sessions)
- **Register session:** Generate or provide an Ed25519 public key (e.g. `ed25519:3t4...`), bind it to an agent account identifier (e.g. `autonomous-agent-01.testnet`), and allocate an initial compute credit quota.
- **Session tracking:** View active sessions, bound public keys, remaining vs. total quota, and active versus suspended status.
- **Quota replenishment:** Top up compute units for active or depleted sessions to restore access.

### 3. Real-time inference streaming (Inference)
- **Session selection:** Pick any registered, funded session key.
- **Model routing:** Choose from gateway-configured upstream models.
- **Live SSE stream viewer:** Enter a prompt and run inference. Requests are cryptographically signed using Ed25519 headers (`X-Decant-Session`, `X-Decant-Timestamp`, `X-Decant-Signature`). Tokens stream in real time from the upstream provider over Server-Sent Events (SSE).
- **Instant credit settlement:** Prompt units and output tokens are metered with latency metrics, automatically debiting the session quota upon verified completion.

### 4. Circuit breaker and policy verification
- **Quota exhaustion lockout (HTTP 402):** When a session drains its allotted credits, the gateway immediately halts compute and returns `HTTP 402 Payment Required`.
- **Anti-tamper protection (HTTP 403):** Requests with mismatched signatures, altered payloads, or invalid timestamps are rejected before contacting the model provider.
- **Payload limits (HTTP 413):** Oversized request bodies exceeding 4KB are blocked at the wire.

### 5. Compute intent marketplace (Routing)
- **Broadcast intent:** Autonomous agents broadcast compute requirements (target model, credit budget, constraints) to the open registry.
- **Intent registry:** Record and review local assignments. Assignments do not dispatch inference to solvers.

### 6. Ledger audit and reservation recovery (Ledger)
- **Double-entry audit log:** Inspect all SQLite ACID transaction records with transaction IDs, unit deductions, top-ups, and timestamps.
- **Stalled reservation review:** The **Reservation Review Panel** surfaces unfinalized compute reservations older than 5 minutes (e.g. following network interruptions or process crashes). Authorized operators review evidence and attest usage before executing safe, idempotent settlements or refunds.

### 7. Observed activity feed (Activity)
- Real-time event stream logging gateway status codes (200, 401, 402, 403, 429), cryptographic verification checks, and provider interactions.

## Agent integration and payment flow

Decant is a two-sided compute gateway: human operators monitor telemetry and allocate allowances via the console, while autonomous AI agents consume compute, sign requests, and pay for inference programmatically.

```
┌─────────────────────────────────┐           ┌──────────────────────────────────────┐
│  Side 1: Operator Console (UI)  │           │   Side 2: Autonomous Agents (API)    │
│  - Real-time telemetry & health │           │  - Cryptographic Ed25519 identity    │
│  - Session enrollment & top-ups │           │  - Real-time SSE token streaming     │
│  - Stalled reservation recovery │           │  - Local intent records             │
└────────────────┬────────────────┘           └──────────────────┬───────────────────┘
                 │                                               │
                 ▼                                               ▼
         ┌──────────────────────────────────────────────────────────────┐
         │             Decant Policy Gateway (Node 24 / SQLite)         │
         │  - Enforces payload caps (<4KB) & token bucket rate limits   │
         │  - Pre-reserves credit ceiling before upstream call          │
         │  - Deducts observed characters; refunds unused balance       │
         │  - Hard circuit-breaker lockout on quota exhaustion (402)    │
         └──────────────────────────────┬───────────────────────────────┘
                                        ▼
                         [Configured AI Model Provider]
```

### 1. How autonomous agents authenticate (Ed25519 Request Signing)

Agents do not rely on static API keys. Instead, every request is cryptographically signed using an Ed25519 keypair conforming to the NEAR protocol standard:

1. The agent holds an Ed25519 private key.
2. For each request, the agent constructs a canonical payload digest:
   ```text
   DIGEST = SHA256(METHOD:PATH:TIMESTAMP:SESSION_ID:SHA256(BODY))
   ```
3. The agent signs this digest and passes it in canonical headers:
   * `X-Decant-Session`: The registered session identifier.
   * `X-Decant-Public-Key`: The agent's Ed25519 public key.
   * `X-Decant-Timestamp`: Monotonic millisecond timestamp (protects against replay attacks).
   * `X-Decant-Signature`: Lowercase hexadecimal signature of the digest.

#### TypeScript SDK Example (`@decant/agent-sdk`)

```typescript
import { DecantClient } from "@decant/agent-sdk";
import { KeyPair, KeyPairEd25519 } from "near-api-js";

// Initialize autonomous agent with an Ed25519 keypair
const agentKeyPair = KeyPair.fromRandom("ed25519") as KeyPairEd25519;
const agent = new DecantClient({
  gatewayUrl: "http://127.0.0.1:8080",
  keyPair: agentKeyPair,
  enableCryptoSigning: true,
  maxOutputUnits: 128,
});

// Stream real-time inference with progressive token callbacks
const response = await agent.streamChat(
  "Analyze market volatility and summarize risks in 3 bullet points",
  (token) => process.stdout.write(token)
);

// Check remaining quota balance and execution audit
const sessionInfo = await agent.getSessionInfo();
console.log(`Remaining credit quota: ${sessionInfo.session.remainingQuota}`);
```

#### Raw HTTP / curl Example

```bash
# Example signed request header format:
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Decant-Session: agent-session-01" \
  -H "X-Decant-Public-Key: ed25519:6E8s8...Wv" \
  -H "X-Decant-Timestamp: 1730919600000" \
  -H "X-Decant-Signature: 3a9f82c..." \
  -d '{
    "model": "gemini-3.5-flash",
    "messages": [{"role": "user", "content": "Hello Decant"}],
    "stream": true
  }'
```

---

### 2. How agents pay for compute (The 5-Stage Settlement Lifecycle)

Decant treats compute access like an atomic credit ledger. Rather than invoicing post-facto or using floating provider token estimates, compute payment follows a strict 5-stage lifecycle:

```
[1. Quota Allotment] ──▶ [2. Pre-Reservation] ──▶ [3. Live Stream] ──▶ [4. Atomic Settlement] ──▶ [5. Circuit Breaker]
  (Session Balance)        (Input + Ceiling)       (Zero Buffer)        (Debit Used, Refund)       (Locks Out at 0)
```

1. **Quota Allotment:**
   * Each agent session is allocated a positive integer credit balance in SQLite, bound to its Ed25519 public key and an owner NEAR account (e.g., `agent.testnet`).
2. **Atomic Upfront Credit Reservation:**
   * Before opening a connection to the upstream model provider, the gateway calculates:
     $$\text{Estimated Input Units} = \lceil \text{Input Characters} / 4 \rceil$$
     $$\text{Reserved Ceiling} = \text{Estimated Input Units} + \text{max\_tokens}$$
   * The gateway deducts this ceiling from the agent's available balance in an immediate SQLite transaction. Concurrent requests from the same agent cannot double-spend unreserved balance.
3. **Real-Time Streaming & Zero-Buffering:**
   * The gateway proxies SSE chunks from the provider with `Transfer-Encoding: chunked` directly to the client without buffering.
4. **Final Settlement & Unused Credit Refund:**
   * Upon stream completion, the gateway calculates the exact observed character units:
     $$\text{Actual Usage} = \lceil \text{Prompt Chars} / 4 \rceil + \lceil \text{Generated Chars} / 4 \rceil$$
   * In a single atomic transaction, the gateway records the final debit and immediately refunds the unused reservation back to the agent's available balance:
     $$\text{Refund} = \text{Reserved Ceiling} - \text{Actual Usage}$$
   * The final `[DONE]` frame is only sent to the agent after the ledger settlement transaction succeeds.
5. **Circuit Breaker Lockout (`HTTP 402`):**
   * If an agent exhausts its quota (remaining balance < reserved ceiling), the gateway terminates access and responds with `HTTP 402 Payment Required`. No calls reach the model provider.
   * **Replenishment:** An operator can top up credits via the console/API (`POST /v1/sessions/:id/topup`), Gateway top-ups update the local ledger.

---

### 3. Local Intent Registry

When autonomous agents need multi-provider routing or solver competition:
1. **Broadcast Intent:** The agent posts a signed intent via `POST /v1/intents/broadcast`:
   ```json
   {
     "model": "gemini-3.5-flash",
     "maxBudget": 200,
     "requirements": "Low latency streaming"
   }
   ```
2. **Assignment:** An operator can assign an intent to a registered solver in the local ledger. Live solver dispatch, completion verification, and settlement remain open.


## Deployment

Start with one gateway and a durable SQLite volume behind HTTPS. The optional Docker Compose setup runs gateway processes on one host with a shared local SQLite volume, Redis, and an Nginx proxy. Validate storage, recovery, and SSE through the proxy before exposing it. The gateway uses SQLite for credit accounting.

## Request authorization

- Health is public. Operator listings and management routes require `X-Decant-Admin-Key`. Missing operator configuration fails closed.
- Inference requires an existing, nonsuspended session, plus a valid signature or operator credential.
- Agents may read their own session and broadcast intents using signed requests. One agent cannot act as another session.
- Signatures cover `METHOD:PATH:TIMESTAMP:SESSION_ID:SHA256(BODY)`, hashed again with SHA-256 and signed with Ed25519. The timestamp is in milliseconds and the signature is lowercase hexadecimal.
- Accepted signatures are stored in SQLite for replay rejection across restarts. A session ID alone does not authorize compute.
- The SDK uses this signing format. Older unsigned clients and signatures without session binding must be upgraded.
- Public NEAR account IDs in session metadata do not prove control of a NEAR wallet. Registration is an operator action, not wallet authentication.

## Credit reservation and settlement

The current billing unit is **estimated character-based credit**, not provider-reported tokenizer usage or a dollar balance:

- Input: `ceil(characters / 4)` across role-prefixed messages joined with newlines.
- Output: `ceil(characters / 4)` across the full generated text; SSE frame counts do not determine the bill.
- `max_tokens` sets the output credit ceiling (default 128, range 1–4096). It is also sent to the provider as its generation limit. Providers tokenize differently; Decant enforces its own output credit ceiling independently.

The gateway deducts the full input-plus-output ceiling in an immediate SQLite transaction before opening an upstream request. Other requests see the reduced available balance. After completion, it records observed usage and refunds unused credit once. `remainingQuota` means currently available credit, excluding active reservations. The response quota header is captured after reservation.

Provider errors, missing completion markers and client disconnects cannot produce successful completion. No output means the reservation is refunded. Partial output is charged according to observed provider output; unused credit is refunded. Provider work is aborted on disconnect or after 120 seconds. A successful `[DONE]` is sent only after settlement succeeds.

After a process crash or settlement failure, unresolved reservations remain deducted. Operators can inspect `GET /v1/reservations` with their key. Do not automatically refund these: first reconcile whether provider work occurred.

In the console's Accounting view, use **Credit held for unfinished requests** to review a reservation. It must be at least five minutes old (the normal request timeout is two minutes) and must not be active on this gateway. Enter reviewed input/output credit units, a reason and an actual provider record/evidence reference; explicitly confirm that provider work has stopped. Save only after checking those records.

The corresponding operator-only endpoint is `POST /v1/reservations/:requestId/review`, with `promptUnits`, `completionUnits`, `reason`, `evidenceReference` and `providerWorkStopped: true`. It atomically records the review, settles the reviewed amount and returns unused credit once. `GET /v1/reservation-reviews` lists the audit. Unknown, recent or already-settled reservations are rejected. Evidence is **operator-attested**, not independently verified by the gateway. Recovery records use the model label `operator-reviewed`, not a claimed inference model. A failing audit write rolls back the refund too.

## Intent and payout boundaries

Broadcasting records a request; filling assigns a solver. It does not execute the solver, verify work, reserve an intent's budget, or issue a reward. Inference currently calls the configured provider directly, separately from intent assignment. The open-intent list is persistent; filled records observed by the console are not a complete historical listing.

`POST /v1/solvers/:id/reward` and `/redeem` return 503 for authorized operators until verified workload rewards and a real payout rail are implemented. They do not mint rewards or burn credits. Historical local redemption records, including records previously marked `Settled`, are **not proof of token transfers**. The console labels these unverified.

The Rust contract source restricts quota mutations to its owner and intent creation to the session owner. Reward and redemption calls are disabled until their missing verification/transfer paths exist. Contract source changes require a deployment and receipt verification before they take effect on-chain.

## Verification

```sh
npm test
npm run test:cluster
npm run build --workspace=packages/gateway
npm run build --workspace=packages/agent-sdk
npm run build:dashboard
npm run test:unit:contracts
npm run build:contracts
```

The JavaScript tests exercise the real gateway and SQLite ledger locally. The contract checks execute the Rust code. A live release requires a separate end-to-end check with a configured provider.

1. Use a fresh `DATABASE_PATH` for live validation if an older local database contains demo records. Keep the existing database for review.
2. Start the gateway and dashboard, sign in as an operator, and register a new session with enough credits for the prompt and output limit.
3. Send one short prompt in **Inference**. Check that the response streams, one ledger record appears, and the change in the session's balance matches that record.
4. Verify a depleted session is blocked before the provider call. Record the results without credentials or private keys.

For read-only testnet quota checks, set `VITE_DECANT_NEAR_CONTRACT_ID` to a verified contract account before running or building the dashboard. A quota read is separate from gateway credit settlement.

## Repository

| Package | Purpose |
| --- | --- |
| `packages/gateway` | HTTP API, authentication, durable reservations, SQLite accounting, provider streaming |
| `packages/dashboard` | Existing React/Vite operator console |
| `packages/agent-sdk` | Session identity, signing and streaming client |
| `packages/contracts` | Rust NEAR contract and unit tests |


## Independent hackathon participation

Isaac (`0xaje`) assists with Decant's backend review and corrections and independently builds [Veyntro](https://github.com/0xaje/Veyntro). Decant and Veyntro are separate products with separate repositories and implementations. No Veyntro code is included in these corrections. This disclosure does not replace accurate contributor/team details in the submission.
