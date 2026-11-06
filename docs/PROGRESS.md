# Decant correction log

Date: 2026-11-06. Baseline: `2fcc71a6d529c298d26e23a03623a581961db6f6` on `main`.
Working branch: `fix/gateway-auth-credit-enforcement`.

Scope: repair the existing compute gateway, operator console and contract. Keep the product purpose and visual design. No Veyntro implementation is used.

## Implemented and verified locally

### 1. Gateway authentication

- Require signed session requests or a valid operator credential. Bind signatures to method, route, timestamp, session and exact payload.
- Reject unknown/suspended sessions even for operators. Validate Ed25519 registration keys.
- Protect private listings and operator mutations. Missing operator configuration fails closed.
- Persist accepted signature fingerprints in SQLite, rejecting replay after restart.
- Support operator credentials in the existing console and shared API client without saving secrets in browser storage.

### 2. Credit enforcement and provider execution

- Reserve maximum input/output credit atomically before starting provider work. Concurrent requests cannot spend the same available credit.
- Settle observed usage once, refund unused allowance, and keep unresolved crash reservations deducted for operator review.
- Abort upstream work on disconnect or timeout. Handle provider failure, missing completion markers, oversized output and chunked oversized input.
- Send successful completion only after settlement succeeds. SDK and console reject incomplete/error streams.
- Remove scripted fallback answers. Require an actual configured provider/model; model choices come from gateway configuration.
- Meter estimated character-based credit units consistently instead of counting SSE chunks as tokens. This is not provider tokenizer billing or a currency balance.

### 3. Honest reward/payout boundaries

- Assigning an intent no longer issues rewards.
- Disable reward minting and redemption endpoints until verified work and actual token transfers exist. No credit burn or fictitious payout success occurs.
- Remove the simulated reward button and seeded earnings balance. Fetch balances through the authenticated configurable API client, and show fetch failures.
- Label historical local redemptions unverified. Remove claims that local records prove NEAR/USDT settlement.
- Health reports NEAR synchronization as not connected.

### 4. Rust contract safeguards

- Restrict quota creation, consumption and topup to the contract owner.
- Restrict intent creation to the registered session owner; bound intent payload and open-intent growth.
- Use checked quota/counter arithmetic.
- Reject unauthorized rewards and disable reward issuance until completed-work verification exists.
- Require the account owner for redemption and reject payouts before burning credits, because no token transfer rail exists.
- Preserve the state fields and existing public JSON argument names. Source changes do not upgrade a deployed contract.

### 5. Documentation and verification workflow

- Document Node 24, operator credentials, provider configuration, signed-request changes and current feature boundaries.
- Add `.env.example` without secrets and repair the actual Rust unit-test script.
- Clearly identify legacy in-memory RPC and text-stream fixtures as test infrastructure.
- Add GitHub Actions for JavaScript tests/builds, actual Rust tests and the WebAssembly build. The initial published branch passed both GitHub CI jobs.
- Add the Decant README disclosure naming Isaac's independent Veyntro participation. The reciprocal disclosure in Veyntro remains outside this task's scope.

## Validation

- JavaScript: 53 passed, 0 failed, 1 optional external NEAR RPC reachability probe skipped.
- Gateway and agent SDK TypeScript builds: passed.
- Dashboard production build: passed. Browser layout has not been visually exercised.
- Actual Rust unit tests: 14 passed.
- Rust release WebAssembly build: passed with `--locked`.
- Live Gemini/OpenAI-compatible model execution: not verified; no user provider credential was supplied. The transport/accounting tests use a controlled local provider fixture and are not live-inference evidence.
- NEAR deployment, chain reconciliation and token payout: not performed.

## Remaining work — do not mark complete

1. Connect and smoke-test the intended real model provider using server-side credentials.
2. Implement verified solver execution/completion receipts. Intent assignment is still separate from inference; no intent budget escrow or reward verification exists.
3. Integrate a deployed NEAR contract with signed writes, receipt checks and reconciliation. Current on-chain quota allocation is owner-managed; public wallet/session ownership enrollment is still needed for a broader agent flow.
4. Implement a funded token payout rail with transfer confirmation, idempotency and failure recovery before enabling redemption.
5. Exercise operator-reviewed reservation recovery against real provider records before deployment; never automatically refund unknown work.
6. Complete deployment/HTTPS/durable storage setup and browser verification.

## Follow-up: operator-reviewed reservation recovery

Implemented an authenticated manual review endpoint and a panel in the existing Accounting screen. Reservations must be at least five minutes old, not currently active on this gateway, and still unsettled. Operators provide reviewed input/output units, a reason, evidence reference and explicit confirmation that provider work has stopped. The gateway records this as operator-attested evidence, not independently verified provider proof.

Usage settlement, unused-credit refund and audit insertion share one SQLite transaction. Duplicate reviews and later normal settlement cannot refund again. Audit insertion failure rolls everything back. Recent or unknown work is never automatically refunded. Eight additional real HTTP/SQLite tests cover authorization, review validation, age limits, partial/zero usage, suspended sessions, duplicate settlement and rollback.

## Publishing status

Write access is now available. The three initial correction commits are published on `fix/gateway-auth-credit-enforcement`, with pull request [#1](https://github.com/Zlatan327/decant/pull/1). Both initial GitHub CI jobs passed. Follow-up commits use the same review branch; no merge or deployment is implied.
