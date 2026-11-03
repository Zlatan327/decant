# DECANT Operator Console

DECANT is a React/TypeScript front end for operators and demo reviewers of the existing DECANT gateway. It reads gateway health, sessions, intents, and ledger records from `/v1`, and can initiate a session-scoped chat-completion stream. It does not rebuild the gateway or seed simulated traffic.

## Architecture

- `src/api/client.ts` implements typed health, session, top-up, intent, fill, and transaction requests.
- `src/api/sse.ts` incrementally parses the actual `/v1/chat/completions` event stream. Requests include the selected `X-Decant-Session`; prompt size is bounded before sending.
- `src/domain/types.ts` and `src/domain/reducer.ts` define the live gateway records and dashboard loading, stale, error, and observed-stream state.
- `src/hooks/useDashboardData.ts` polls health/session/intent/transaction resources independently, falls back only to explicitly tracked session details if a global list returns 404, and records only actual console request outcomes.
- `src/components/SidebarNav.tsx` implements the dark vertical icon navigation rail, organizing the console into 5 focused operational workspaces plus an executive overview:
  - **All Overview:** High-level system health, session gauges, active intent lanes, and live request log.
  - **Identity / credit:** Ed25519 public keys, compute token quotas, registration, and top-up replenishment.
  - **Session-scoped request:** Live token-by-token SSE streaming, model selection, latency telemetry, and spending circuit breakers.
  - **Routing / settlement:** Decentralized compute intent registry, solver bidding, and settlement matching.
  - **Accounting / reconciliation:** Persistent SQLite ACID transaction audit log, token consumption, and cost units.
  - **Observed evidence:** Real-time gateway request history and directly observed HTTP 200/401/402/403 security telemetry.
- `src/components/` contains the accessible health rail, session/quota panel, observed activity feed, streaming viewer, intent lifecycle board, and transaction audit.
- `src/styles.css` applies the supplied DECANT dark/glass tokens (`#040406` deep canvas, Clash Display, JetBrains Mono), responsive layouts, and restrained micro-motion.

## Run Locally

### From the Monorepo Root (Recommended)

1. Start the existing gateway (port 8080):
   ```sh
   npm run dev:gateway
   ```

2. Start the operator console in another terminal (port 3000):
   ```sh
   npm run dev:dashboard
   ```

3. Build and typecheck:
   ```sh
   npm run build:dashboard
   ```

### Standalone (inside `packages/dashboard`)

```sh
npm install
npm run dev
npm run typecheck
npm run build
```

The Vite development proxy sends relative `/v1` requests to `http://127.0.0.1:8080`. Set `DECANT_GATEWAY_DEV_TARGET` if the gateway uses another local address. For a published static front end, set the public `VITE_DECANT_API_BASE_URL` to the gateway's HTTPS base URL or configure a same-origin reverse proxy. A browser-facing API base URL is public configuration; never put provider keys or agent private keys in it.

The operator console never requests or stores the Gemini API key. It remains server-side in the gateway environment. A chat request is user-triggered and can consume session quota; the actual response model is displayed. Gateway fallback models are labeled as fallback rather than Gemini.

## Live-Data Boundaries

The dashboard does not invent sessions, events, requests, token output, balances, or settlement records. Its activity feed combines records returned by the transaction ledger with API outcomes directly observed by this console. It does not claim to subscribe to all agent requests or global signature/quota rejections because the supplied endpoint list has no global rejection/event stream.

The gateway implements `GET /v1/sessions` and `GET /v1/transactions` directly backed by its persistent SQLite ledger. The frontend is designed to be backward-compatible: if connected to a legacy revision where those routes return 404, it transparently degrades to explicit session IDs with the `GET /v1/sessions/:id` detail route and labels the view scope accurately. `GET /v1/intents` returns open intents; filled/settled lanes show only API-confirmed actions and otherwise state that those records are not exposed.
