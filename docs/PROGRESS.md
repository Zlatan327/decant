# Decant correction log

Scope: repair the existing compute gateway and operator console. Keep its product purpose and visual design. No Veyntro implementation is used.

## 2026-11-06 — Authentication and ownership gate

Implemented:
- Require signed requests bound to method, path, timestamp, session ID, and payload, or a valid operator key.
- Reject unknown/suspended sessions even for operators.
- Protect ledger listings and operator mutations; missing operator configuration fails closed.
- Persist accepted signature fingerprints in SQLite to reject replay after restart.
- Stop rewarding solvers merely for accepting an intent.
- Add an operator-key input to the existing console; the key stays in memory, never in browser storage or a public build variable.
- Report NEAR synchronization as not connected instead of asserting it is active.

Verified: gateway TypeScript build and dashboard production build; 23 tests across the production backend and authorization regression suites. Existing production inference tests currently exercise the legacy scripted fallback; they do not establish real model execution. This is addressed in the next correction.

Remaining:
1. Reserve credit before compute; settle usage and release reservations safely.
2. Remove scripted successful inference and verify provider failure handling.
3. Correct redemption UI and disable payout claims until an actual transfer rail exists.
4. Harden the Rust contract and run its actual Rust tests.
5. Deploy and wire NEAR settlement with account credentials and inspectable receipts.
6. Implement rewards backed by verified work and real token payouts.

Publishing: GitHub app branch creation returned HTTP 403 (integration has read access only). Git publishing is being checked separately. No remote changes have been confirmed.
