-- ==============================================================================
-- init.sql — PostgreSQL Schema for Decant Decentralized Compute Gateway
--
-- Replaces single-process embedded SQLite with a horizontally scalable relational
-- database behind PgBouncer for multi-server cluster nodes (Server 1, Server 2, Server 3).
-- ==============================================================================

-- 1. Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) PRIMARY KEY,
    public_key VARCHAR(128) NOT NULL,
    owner_account_id VARCHAR(128) NOT NULL,
    total_quota BIGINT NOT NULL,
    remaining_quota BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('active', 'exhausted', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(owner_account_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- 2. Inference Reservations Table
CREATE TABLE IF NOT EXISTS inference_reservations (
    request_id VARCHAR(128) PRIMARY KEY,
    session_id VARCHAR(128) NOT NULL REFERENCES sessions(session_id),
    reserved_units BIGINT NOT NULL CHECK (reserved_units > 0),
    used_units BIGINT,
    status VARCHAR(32) NOT NULL CHECK (status IN ('reserved', 'settled')),
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reservations_session ON inference_reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON inference_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_created_at ON inference_reservations(created_at);

-- 3. Reservation Reviews (Operator Attestation & Disaster Recovery)
CREATE TABLE IF NOT EXISTS reservation_reviews (
    request_id VARCHAR(128) PRIMARY KEY,
    prompt_units BIGINT NOT NULL,
    completion_units BIGINT NOT NULL,
    reason TEXT NOT NULL,
    evidence_reference TEXT NOT NULL,
    reviewed_at BIGINT NOT NULL,
    reviewer_role VARCHAR(64) NOT NULL
);

-- 4. Used Signatures (Replay Protection fallback if Redis is flushing)
CREATE TABLE IF NOT EXISTS used_signatures (
    signature VARCHAR(256) PRIMARY KEY,
    expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_used_signatures_expires_at ON used_signatures(expires_at);

-- 5. Intents Table (Marketplace Routing)
CREATE TABLE IF NOT EXISTS intents (
    intent_id VARCHAR(128) PRIMARY KEY,
    session_id VARCHAR(128) NOT NULL REFERENCES sessions(session_id),
    model VARCHAR(128) NOT NULL,
    max_budget BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('open', 'filled', 'settled', 'expired')),
    solver_id VARCHAR(128),
    created_at BIGINT NOT NULL,
    filled_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
CREATE INDEX IF NOT EXISTS idx_intents_session ON intents(session_id);

-- 6. Transactions Audit Ledger
CREATE TABLE IF NOT EXISTS transactions (
    tx_id VARCHAR(128) PRIMARY KEY,
    session_id VARCHAR(128) NOT NULL REFERENCES sessions(session_id),
    prompt_tokens BIGINT NOT NULL,
    completion_tokens BIGINT NOT NULL,
    cost_units BIGINT NOT NULL,
    model VARCHAR(128) NOT NULL,
    upstream_latency_ms INTEGER NOT NULL,
    timestamp BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_session ON transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);

-- 7. Solvers Registry (DePIN compute providers)
CREATE TABLE IF NOT EXISTS solvers (
    solver_id VARCHAR(128) PRIMARY KEY,
    endpoint_url TEXT NOT NULL,
    models_supported TEXT[] NOT NULL,
    price_per_k_tokens NUMERIC(10, 4) NOT NULL,
    reputation_score NUMERIC(5, 2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- 8. Solver Earnings
CREATE TABLE IF NOT EXISTS solver_earnings (
    solver_id VARCHAR(128) PRIMARY KEY,
    earned_credits BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL
);

-- Seed default primary solver
INSERT INTO solvers (solver_id, endpoint_url, models_supported, price_per_k_tokens, reputation_score, is_active)
VALUES (
    'decant-solver-primary.testnet',
    'https://api.decant.internal/inference',
    ARRAY['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'],
    1.0,
    4.95,
    TRUE
) ON CONFLICT (solver_id) DO NOTHING;
