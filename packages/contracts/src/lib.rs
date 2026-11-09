/**
 * lib.rs — Decant NEAR Smart Contract
 *
 * Lightweight on-chain ledger tracking:
 *   • Active Quotas: Mapping of SessionID → available compute tokens.
 *   • Intent Registry: Broadcasted agent requests looking for a credit supplier.
 *
 * All state mutations are deterministic and verifiable on-chain.
 * No LLM inference, no probabilistic logic — pure accounting.
 */

use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};

// ─── Storage Keys ───────────────────────────────────────────────────────────

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Quotas,
    Intents,
    EarnedCredits,
    Redemptions,
}

// ─── Data Structures ────────────────────────────────────────────────────────

/// A registered session with an allocated compute quota.
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Quota {
    pub session_id: String,
    pub owner: AccountId,
    /// Total compute tokens originally allocated.
    pub total: u64,
    /// Remaining compute tokens available for use.
    pub remaining: u64,
}

#[near(serializers = [borsh])]
struct InferenceDebit {
    session_id: String,
    amount: u64,
}

/// A settlement redemption record converting earned compute credits into spendable USDT value.
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct RedemptionRecord {
    pub redemption_id: String,
    pub account_id: AccountId,
    pub credits_burned: u64,
    /// USDT amount denominated in cents (e.g. 1,000 credits = $1.00 USDT = 100 cents).
    pub usdt_amount_cents: u64,
    pub timestamp: u64,
    pub status: String,
}

/// The status of an intent in the registry.
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub enum IntentStatus {
    /// Waiting for a solver to fill the request.
    Open,
    /// A solver has committed to fulfilling the request.
    Filled,
    /// The intent expired without being filled.
    Expired,
}

/// A broadcasted agent request looking for a credit supplier / compute provider.
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Intent {
    pub intent_id: String,
    pub session_id: String,
    /// The agent's request payload (e.g., model name, prompt hash, token budget).
    pub payload: String,
    pub status: IntentStatus,
    /// The solver who filled this intent (if any).
    pub solver_id: Option<AccountId>,
    /// Block timestamp when the intent was created.
    pub created_at: u64,
}

// ─── Contract State ─────────────────────────────────────────────────────────

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct DecantContract {
    /// Session ID → Quota mapping.
    quotas: LookupMap<String, Quota>,
    /// Intent ID → Intent mapping.
    intents: LookupMap<String, Intent>,
    /// Auto-incrementing intent counter.
    intent_counter: u64,
    /// List of open intent IDs (for enumeration).
    open_intent_ids: Vec<String>,
    /// Contract owner (admin).
    owner: AccountId,
    /// Solver / User AccountId → Earned compute credit tokens.
    earned_credits: LookupMap<AccountId, u64>,
    /// Total redemptions counter.
    redemption_counter: u64,
    /// Redemption ID → RedemptionRecord.
    redemptions: LookupMap<String, RedemptionRecord>,
}

// ─── Contract Implementation ────────────────────────────────────────────────

#[near]
impl DecantContract {
    fn assert_owner(&self) {
        assert!(env::predecessor_account_id() == self.owner, "Contract owner required");
    }

    /// Initialize the contract. Called once at deployment.
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            quotas: LookupMap::new(StorageKey::Quotas),
            intents: LookupMap::new(StorageKey::Intents),
            intent_counter: 0,
            open_intent_ids: Vec::new(),
            owner,
            earned_credits: LookupMap::new(StorageKey::EarnedCredits),
            redemption_counter: 0,
            redemptions: LookupMap::new(StorageKey::Redemptions),
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Quota Management
    // ═══════════════════════════════════════════════════════════════════════

    /// Register a new session with an allocated quota of compute tokens.
    ///
    /// Only the operator/contract owner may allocate credits. Credits are accounting
    /// units; this method does not represent a token deposit or collateral.
    pub fn register_session(&mut self, session_id: String, quota: u64) {
        self.assert_owner();
        assert!(!session_id.is_empty() && session_id.len() <= 128, "Invalid session ID");
        assert!(quota > 0, "Quota must be positive");
        let caller = env::predecessor_account_id();
        assert!(
            self.quotas.get(&session_id).is_none(),
            "Session already registered"
        );

        let entry = Quota {
            session_id: session_id.clone(),
            owner: caller,
            total: quota,
            remaining: quota,
        };

        self.quotas.insert(session_id.clone(), entry);
        env::log_str(&format!(
            "Session '{}' registered with {} compute tokens",
            session_id, quota
        ));
    }

    /// Consume compute tokens from a session's quota.
    ///
    /// Called by the gateway after successfully proxying a request.
    /// Panics if the session doesn't exist or has insufficient balance.
    pub fn consume_quota(&mut self, session_id: String, amount: u64) {
        self.assert_owner();
        assert!(amount > 0, "Amount must be positive");
        let quota = self
            .quotas
            .get_mut(&session_id)
            .expect("Session not found");

        assert!(
            quota.remaining >= amount,
            "Insufficient quota: {} remaining, {} requested",
            quota.remaining,
            amount
        );

        quota.remaining -= amount;
        env::log_str(&format!(
            "Session '{}': consumed {}, remaining {}",
            session_id, amount, quota.remaining
        ));
    }

    /// Apply one local inference debit once. Returns false for an exact retry.
    pub fn settle_inference(&mut self, request_id: String, session_id: String, amount: u64) -> bool {
        self.assert_owner();
        assert!(!request_id.is_empty() && request_id.len() <= 128, "Invalid request ID");
        // This namespace is separate from the existing collection prefixes and
        // leaves the serialized contract state compatible with existing deployments.
        let mut key = b"decant:inference:v1:".to_vec();
        key.extend_from_slice(request_id.as_bytes());
        if let Some(bytes) = env::storage_read(&key) {
            let prior: InferenceDebit = near_sdk::borsh::from_slice(&bytes)
                .expect("Invalid stored inference debit");
            assert!(prior.session_id == session_id && prior.amount == amount, "Conflicting inference debit");
            return false;
        }

        self.consume_quota(session_id.clone(), amount);
        let bytes = near_sdk::borsh::to_vec(&InferenceDebit { session_id, amount })
            .expect("Could not encode inference debit");
        env::storage_write(&key, &bytes);
        true
    }

    /// Top up a session's quota with additional compute tokens.
    pub fn topup_quota(&mut self, session_id: String, amount: u64) {
        self.assert_owner();
        assert!(amount > 0, "Amount must be positive");
        let quota = self
            .quotas
            .get_mut(&session_id)
            .expect("Session not found");

        let remaining = quota.remaining.checked_add(amount).expect("Quota overflow");
        let total = quota.total.checked_add(amount).expect("Quota overflow");
        quota.remaining = remaining;
        quota.total = total;
        env::log_str(&format!(
            "Session '{}': topped up {}, remaining {}",
            session_id, amount, quota.remaining
        ));
    }

    /// View method: get a session's quota information.
    pub fn get_quota(&self, session_id: String) -> Quota {
        self.quotas
            .get(&session_id)
            .expect("Session not found")
            .clone()
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Intent Registry
    // ═══════════════════════════════════════════════════════════════════════

    /// Broadcast an intent: an agent request looking for a credit supplier.
    ///
    /// The caller must have a registered session with remaining quota.
    pub fn broadcast_intent(&mut self, session_id: String, payload: String) -> String {
        let quota = self
            .quotas
            .get(&session_id)
            .expect("Session not found — register first");

        assert!(env::predecessor_account_id() == quota.owner, "Session owner required");
        assert!(quota.remaining > 0, "No remaining quota to broadcast intent");
        assert!(payload.len() <= 4096, "Intent payload too large");
        assert!(self.open_intent_ids.len() < 1000, "Open intent limit reached");
        self.intent_counter = self.intent_counter.checked_add(1).expect("Intent counter overflow");
        let intent_id = format!("intent-{}", self.intent_counter);

        let intent = Intent {
            intent_id: intent_id.clone(),
            session_id,
            payload,
            status: IntentStatus::Open,
            solver_id: None,
            created_at: env::block_timestamp(),
        };

        self.intents.insert(intent_id.clone(), intent);
        self.open_intent_ids.push(intent_id.clone());

        env::log_str(&format!("Intent '{}' broadcasted", intent_id));
        intent_id
    }

    /// A solver fills an open intent, committing to provide the compute.
    pub fn fill_intent(&mut self, intent_id: String) {
        let caller = env::predecessor_account_id();
        let intent = self
            .intents
            .get_mut(&intent_id)
            .expect("Intent not found");

        assert!(
            intent.status == IntentStatus::Open,
            "Intent is not open — current status: {:?}",
            match intent.status {
                IntentStatus::Open => "Open",
                IntentStatus::Filled => "Filled",
                IntentStatus::Expired => "Expired",
            }
        );

        intent.status = IntentStatus::Filled;
        intent.solver_id = Some(caller.clone());

        // Remove from open intents list
        self.open_intent_ids.retain(|id| id != &intent_id);

        env::log_str(&format!(
            "Intent '{}' filled by solver '{}'",
            intent_id, caller
        ));
    }

    /// View method: get intent details.
    pub fn get_intent(&self, intent_id: String) -> Intent {
        self.intents
            .get(&intent_id)
            .expect("Intent not found")
            .clone()
    }

    /// View method: list all currently open intents.
    pub fn list_open_intents(&self) -> Vec<Intent> {
        self.open_intent_ids
            .iter()
            .filter_map(|id| self.intents.get(id).cloned())
            .collect()
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Compute-to-Value & Redemption Engine
    // ═══════════════════════════════════════════════════════════════════════

    /// Disabled until a verifier can bind rewards to completed compute work.
    pub fn reward_solver(&mut self, solver_id: AccountId, amount: u64) -> u64 {
        self.assert_owner();
        let _ = (solver_id, amount);
        env::panic_str("Rewards unavailable: completed-work verification is not connected")
    }

    /// View method: get a solver or user's earned credit balance.
    pub fn get_earned_credits(&self, account_id: AccountId) -> u64 {
        self.earned_credits.get(&account_id).copied().unwrap_or(0)
    }

    /// A payout must not burn credits or claim settlement without a token transfer rail.
    pub fn redeem_to_usdt(&mut self, account_id: AccountId, credits: u64) -> RedemptionRecord {
        assert!(env::predecessor_account_id() == account_id, "Account owner required");
        let _ = credits;
        env::panic_str("USDT payouts are not connected; no credits have been burned")
    }

    /// View method: retrieve a redemption audit record.
    pub fn get_redemption(&self, redemption_id: String) -> RedemptionRecord {
        self.redemptions
            .get(&redemption_id)
            .expect("Redemption record not found")
            .clone()
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Unit Tests
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn get_context(predecessor: &str) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor.parse().unwrap());
        builder
    }

    #[test]
    fn test_register_and_get_quota() {
        let context = get_context("owner.test.near");
        testing_env!(context.build());

        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("session-001".to_string(), 100);

        let quota = contract.get_quota("session-001".to_string());
        assert_eq!(quota.remaining, 100);
        assert_eq!(quota.total, 100);
        assert_eq!(quota.session_id, "session-001");
    }

    #[test]
    fn test_consume_quota() {
        let context = get_context("owner.test.near");
        testing_env!(context.build());

        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("session-001".to_string(), 100);
        contract.consume_quota("session-001".to_string(), 10);

        let quota = contract.get_quota("session-001".to_string());
        assert_eq!(quota.remaining, 90);
    }

    #[test]
    fn test_inference_debit_is_idempotent() {
        testing_env!(get_context("owner.test.near").build());
        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("session".into(), 100);
        assert!(contract.settle_inference("request".into(), "session".into(), 22));
        assert!(!contract.settle_inference("request".into(), "session".into(), 22));
        assert_eq!(contract.get_quota("session".into()).remaining, 78);
    }

    #[test]
    #[should_panic(expected = "Conflicting inference debit")]
    fn test_inference_debit_rejects_changed_amount() {
        testing_env!(get_context("owner.test.near").build());
        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("session".into(), 100);
        contract.settle_inference("request".into(), "session".into(), 22);
        contract.settle_inference("request".into(), "session".into(), 23);
    }

    #[test]
    #[should_panic(expected = "Contract owner required")]
    fn test_inference_debit_requires_owner() {
        testing_env!(get_context("owner.test.near").build());
        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("session".into(), 100);
        testing_env!(get_context("agent.test.near").build());
        contract.settle_inference("request".into(), "session".into(), 22);
    }

    #[test]
    #[should_panic(expected = "Insufficient quota")]
    fn test_consume_quota_exceeds_balance() {
        let context = get_context("owner.test.near");
        testing_env!(context.build());

        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("session-001".to_string(), 5);
        contract.consume_quota("session-001".to_string(), 10);
    }

    #[test]
    fn test_topup_quota() {
        let context = get_context("owner.test.near");
        testing_env!(context.build());

        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("session-001".to_string(), 50);
        contract.topup_quota("session-001".to_string(), 25);

        let quota = contract.get_quota("session-001".to_string());
        assert_eq!(quota.remaining, 75);
        assert_eq!(quota.total, 75);
    }

    #[test]
    #[should_panic(expected = "Session already registered")]
    fn test_duplicate_session_registration() {
        let context = get_context("owner.test.near");
        testing_env!(context.build());

        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("session-001".to_string(), 100);
        contract.register_session("session-001".to_string(), 50);
    }

    #[test]
    fn test_broadcast_and_fill_intent() {
        let context = get_context("owner.test.near");
        testing_env!(context.build());

        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("session-001".to_string(), 100);

        let intent_id = contract.broadcast_intent(
            "session-001".to_string(),
            "llama3:8b:summarize".to_string(),
        );

        // Verify intent is open
        let intent = contract.get_intent(intent_id.clone());
        assert_eq!(intent.status, IntentStatus::Open);
        assert!(intent.solver_id.is_none());

        // List open intents
        let open = contract.list_open_intents();
        assert_eq!(open.len(), 1);

        // Solver fills the intent
        let solver_context = get_context("solver.test.near");
        testing_env!(solver_context.build());
        contract.fill_intent(intent_id.clone());

        // Verify intent is now filled
        let filled = contract.get_intent(intent_id);
        assert_eq!(filled.status, IntentStatus::Filled);
        assert_eq!(
            filled.solver_id.unwrap().to_string(),
            "solver.test.near"
        );

        // No more open intents
        let open = contract.list_open_intents();
        assert_eq!(open.len(), 0);
    }

    #[test]
    #[should_panic(expected = "Session not found")]
    fn test_get_nonexistent_session() {
        let context = get_context("owner.test.near");
        testing_env!(context.build());

        let contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.get_quota("nonexistent".to_string());
    }

    #[test]
    fn test_quota_decreases_after_multiple_consumptions() {
        let context = get_context("owner.test.near");
        testing_env!(context.build());

        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("session-001".to_string(), 100);

        for _ in 0..10 {
            contract.consume_quota("session-001".to_string(), 1);
        }

        let quota = contract.get_quota("session-001".to_string());
        assert_eq!(quota.remaining, 90);
        assert_eq!(quota.total, 100);
    }
    #[test]
    #[should_panic(expected = "Contract owner required")]
    fn rejects_unauthorized_credit_creation() {
        testing_env!(get_context("attacker.test.near").build());
        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("victim".into(), 100);
    }

    #[test]
    #[should_panic(expected = "Contract owner required")]
    fn rejects_unauthorized_consumption() {
        testing_env!(get_context("owner.test.near").build());
        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("victim".into(), 100);
        testing_env!(get_context("attacker.test.near").build());
        contract.consume_quota("victim".into(), 1);
    }

    #[test]
    #[should_panic(expected = "Contract owner required")]
    fn rejects_unauthorized_topup() {
        testing_env!(get_context("owner.test.near").build());
        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.register_session("victim".into(), 100);
        testing_env!(get_context("attacker.test.near").build());
        contract.topup_quota("victim".into(), 1);
    }

    #[test]
    #[should_panic(expected = "Contract owner required")]
    fn rejects_unauthorized_rewards() {
        testing_env!(get_context("attacker.test.near").build());
        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.reward_solver("attacker.test.near".parse().unwrap(), 100);
    }

    #[test]
    #[should_panic(expected = "Account owner required")]
    fn rejects_unauthorized_redemption() {
        testing_env!(get_context("attacker.test.near").build());
        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.redeem_to_usdt("victim.test.near".parse().unwrap(), 100);
    }

    #[test]
    #[should_panic(expected = "USDT payouts are not connected")]
    fn rejects_unconnected_payout() {
        testing_env!(get_context("owner.test.near").build());
        let mut contract = DecantContract::new("owner.test.near".parse().unwrap());
        contract.redeem_to_usdt("owner.test.near".parse().unwrap(), 100);
    }

}
