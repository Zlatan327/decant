-- ==============================================================================
-- deploy/postgres/init.sql — Production Schema for Decant Multi-Node Cluster
--
-- PgBouncer Transaction Mode Compatible:
--   - No session-level state, no advisory locks, no SET statements.
--   - Strict row-level locking (SELECT ... FOR UPDATE / UPDATE ... RETURNING).
--   - Fully ACID-compliant for multi-container deployments.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  public_key VARCHAR(255) NOT NULL,
  owner_account_id VARCHAR(255) NOT NULL,
  total_quota BIGINT NOT NULL,
  remaining_quota BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL CHECK(status IN ('active', 'exhausted', 'suspended'))
);

CREATE TABLE IF NOT EXISTS inference_reservations (
  request_id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  reserved_units INT NOT NULL CHECK(reserved_units > 0),
  used_units INT,
  status VARCHAR(32) NOT NULL CHECK(status IN ('reserved', 'settled')),
  created_at BIGINT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE TABLE IF NOT EXISTS reservation_reviews (
  request_id VARCHAR(255) PRIMARY KEY,
  prompt_units INT NOT NULL,
  completion_units INT NOT NULL,
  reason TEXT NOT NULL,
  evidence_reference TEXT NOT NULL,
  reviewed_at BIGINT NOT NULL,
  reviewer_role VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS used_signatures (
  signature VARCHAR(255) PRIMARY KEY,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS intents (
  intent_id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  model VARCHAR(255) NOT NULL,
  max_budget BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL CHECK(status IN ('open', 'filled', 'settled', 'expired')),
  solver_id VARCHAR(255),
  created_at BIGINT NOT NULL,
  filled_at BIGINT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  tx_id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  prompt_tokens INT NOT NULL,
  completion_tokens INT NOT NULL,
  cost_units INT NOT NULL,
  model VARCHAR(255) NOT NULL,
  upstream_latency_ms INT NOT NULL,
  timestamp BIGINT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE TABLE IF NOT EXISTS solvers (
  solver_id VARCHAR(255) PRIMARY KEY,
  endpoint_url TEXT NOT NULL,
  models_supported TEXT NOT NULL,
  price_per_k_tokens NUMERIC NOT NULL,
  reputation_score NUMERIC NOT NULL,
  is_active INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS solver_earnings (
  solver_id VARCHAR(255) PRIMARY KEY,
  earned_credits BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS redemptions (
  redemption_id VARCHAR(255) PRIMARY KEY,
  account_id VARCHAR(255) NOT NULL,
  credits_burned BIGINT NOT NULL,
  usdt_amount_cents BIGINT NOT NULL,
  timestamp BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
CREATE INDEX IF NOT EXISTS idx_tx_session ON transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_account ON redemptions(account_id);
CREATE INDEX IF NOT EXISTS idx_used_sigs_expires ON used_signatures(expires_at);
