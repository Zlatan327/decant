# Decant operator console

The existing React/TypeScript console reads gateway health, sessions, intents and credit records and initiates SSE inference requests. Run `npm run dev:gateway` and `npm run dev:dashboard` from the repository root.

Enter the gateway operator key in the console to authorize management requests. It is kept only in module memory for this page visit; it is never stored in localStorage or a public build variable. Refreshing the page clears it. Agents should use the signing SDK; this interface is an operator console.

Models come from the gateway health response, not a hardcoded list. Inference requires a registered session, enough credit to reserve the maximum request cost, and a real provider configured on the server. The console rejects SSE errors and missing completion markers.

The dev proxy sends `/v1` to `http://127.0.0.1:8080`; use `DECANT_GATEWAY_DEV_TARGET` to change it. A separately hosted frontend uses `VITE_DECANT_API_BASE_URL`; the gateway must allow that origin with `CORS_ORIGINS`. Use HTTPS remotely. Never put provider credentials or the operator key in a `VITE_` variable.

```sh
npm run build:dashboard
```

The Accounting screen also supports manual review of credit held for unfinished requests. It requires reviewed usage, an evidence reference and stopped-work confirmation; the server enforces age, authorization and single-settlement rules.

See the root README and `docs/PROGRESS.md` for metering, security, verification and deployment limitations. Set `VITE_DECANT_NEAR_CONTRACT_ID` for read-only quota inspection of a verified testnet contract.
