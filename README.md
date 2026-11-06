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

After a process crash or settlement failure, unresolved reservations remain deducted. Operators can inspect `GET /v1/reservations` with their key. Do not automatically refund these: first reconcile whether provider work occurred. A safe recovery workflow still needs implementation.

## Intent and payout boundaries

Broadcasting records a request; filling assigns a solver. It does not execute the solver, verify work, reserve an intent's budget, or issue a reward. Inference currently calls the configured provider directly, separately from intent assignment. The open-intent list is persistent; filled records observed by the console are not a complete historical listing.

`POST /v1/solvers/:id/reward` and `/redeem` return 503 for authorized operators until verified workload rewards and a real payout rail are implemented. They do not mint rewards or burn credits. Historical local redemption records, including records previously marked `Settled`, are **not proof of token transfers**. The console labels these unverified.

The Rust contract source restricts quota mutations to its owner and intent creation to the session owner. Reward and redemption calls are disabled until their missing verification/transfer paths exist. It is not deployed or verified by the JavaScript sandbox tests. Existing on-chain deployments, if any, are not changed by editing this repository.

## Verification

```sh
npm test
npm run build --workspace=packages/gateway
npm run build --workspace=packages/agent-sdk
npm run build:dashboard
npm run test:unit:contracts
npm run build:contracts
```

`npm test` runs local JavaScript tests. The provider transport tests use an explicitly controlled HTTP fixture to verify credit accounting and failure paths. Legacy sandbox and DePIN transport fixtures simulate state or output for tests only; they do not execute Rust, prove live inference, or transfer tokens. The optional RPC reachability probe runs with `NEAR_LIVE_PROBE=true`; reachability alone does not prove a contract is deployed.

`npm run test:unit:contracts` runs actual Rust unit tests. A GitHub Actions workflow runs local tests, TypeScript builds and Rust validation once this branch is published. See [docs/PROGRESS.md](docs/PROGRESS.md) for verified results and open work.

`npm run simulate` is a local harness that requires a configured real model provider. It allocates test credits in an isolated in-memory ledger and makes a real provider request. It does not settle on NEAR or pay USDT. `npm run seed` creates sample records for local development; never use its records as live activity or submission evidence.

## Repository

| Package | Purpose |
| --- | --- |
| `packages/gateway` | HTTP API, authentication, durable reservations, SQLite accounting, provider streaming |
| `packages/dashboard` | Existing React/Vite operator console |
| `packages/agent-sdk` | Session identity, signing and streaming client |
| `packages/contracts` | Rust NEAR ledger source; separate legacy in-memory RPC test fixture |
| `packages/simulator` | Explicit local execution harness |

## Independent hackathon participation

Isaac (`0xaje`) assists with Decant's backend review and corrections and independently builds [Veyntro](https://github.com/0xaje/Veyntro). Decant and Veyntro are separate products with separate repositories and implementations. No Veyntro code is included in these corrections. This disclosure does not replace accurate contributor/team details in the submission.
