import type { DashboardSection } from './SidebarNav';
import { targetAttributes } from './targets';

interface HowItWorksViewProps {
  onNavigate: (section: DashboardSection) => void;
}

export function HowItWorksView({ onNavigate }: HowItWorksViewProps) {
  return (
    <div className="workspace-view how-it-works-view" {...targetAttributes('how-it-works-view', 'panel')}>
      {/* ── Editorial Header ── */}
      <div className="guide-hero">
        <span className="guide-eyebrow mono">ARCHITECTURE &amp; SETTLEMENT PROTOCOL</span>
        <h1 className="guide-title">How Decant Works</h1>
        <p className="guide-lead">
          A high-throughput intent-settlement gateway routing AI compute across open-weight models,
          DePIN GPU nodes, and upstream APIs with atomic NEAR Protocol credit settlement.
        </p>
      </div>

      {/* ── 4 Architectural Steps Grid ── */}
      <div className="guide-steps-grid">
        {/* Step 01 */}
        <div className="guide-card">
          <div className="guide-card__header">
            <span className="guide-card__num mono">01</span>
            <span className="guide-card__tag mono">IDENTITY &amp; AUTH</span>
          </div>
          <h2 className="guide-card__title">Cryptographic Session Keys</h2>
          <p className="guide-card__text">
            Agents register an Ed25519 public key and obtain an allotted compute quota. Every incoming request
            is cryptographically verified via <code className="mono">X-Decant-Signature</code>, strictly eliminating
            replay attacks and unauthorized access.
          </p>
          <div className="guide-card__code mono">
            <code>POST /v1/sessions/register</code>
            <span className="code-sub">&#123; "sessionId": "agent-01", "quota": 1000 &#125;</span>
          </div>
          <button
            type="button"
            className="guide-card__action"
            onClick={() => onNavigate('identity')}
          >
            Manage Sessions &amp; Quotas &rarr;
          </button>
        </div>

        {/* Step 02 */}
        <div className="guide-card">
          <div className="guide-card__header">
            <span className="guide-card__num mono">02</span>
            <span className="guide-card__tag mono">COMPUTE ROUTING</span>
          </div>
          <h2 className="guide-card__title">Intent Broadcast &amp; Solver Matching</h2>
          <p className="guide-card__text">
            Requesters broadcast compute intents specifying target models (e.g. Meta Llama 3, Gemini, Mistral) and token budgets.
            Decentralized DePIN solvers claim open intents, fulfill workloads, and stream progressive SSE tokens back.
          </p>
          <div className="guide-card__code mono">
            <code>POST /v1/intents/broadcast</code>
            <span className="code-sub">&#123; "model": "llama3", "maxBudget": 200 &#125;</span>
          </div>
          <button
            type="button"
            className="guide-card__action"
            onClick={() => onNavigate('routing')}
          >
            Explore Intent Marketplace &rarr;
          </button>
        </div>

        {/* Step 03 */}
        <div className="guide-card">
          <div className="guide-card__header">
            <span className="guide-card__num mono">03</span>
            <span className="guide-card__tag mono">INFERENCE &amp; ACCOUNTING</span>
          </div>
          <h2 className="guide-card__title">Real-Time Streaming &amp; ACID Ledger</h2>
          <p className="guide-card__text">
            Inference streams through OpenAI-compatible SSE endpoints. Tokens stream in real time while usage
            is atomically deducted from the persistent SQLite WAL ledger. If quota reaches zero, the HTTP 402 circuit breaker
            instantly halts execution.
          </p>
          <div className="guide-card__code mono">
            <code>POST /v1/chat/completions</code>
            <span className="code-sub">&#123; "model": "llama3", "stream": true &#125;</span>
          </div>
          <button
            type="button"
            className="guide-card__action"
            onClick={() => onNavigate('request')}
          >
            Open Inference Console &rarr;
          </button>
        </div>

        {/* Step 04 */}
        <div className="guide-card guide-card--featured">
          <div className="guide-card__header">
            <span className="guide-card__num mono">04</span>
            <span className="guide-card__tag mono">VALUE ACCRUAL</span>
          </div>
          <h2 className="guide-card__title">Compute-to-Value Redemption (USDT)</h2>
          <p className="guide-card__text">
            Solvers and GPU nodes earn compute credits for fulfilled workloads. Solvers burn earned credits on-chain
            to redeem spendable <strong>USDT value</strong> at a deterministic rate of{' '}
            <strong>1,000 Credits = $1.00 USDT ($0.001 per token)</strong>.
          </p>
          <div className="guide-card__code mono">
            <code>POST /v1/solvers/:id/redeem</code>
            <span className="code-sub">&#123; "credits": 1000 &#125; &rarr; $1.00 USDT (Settled)</span>
          </div>
          <button
            type="button"
            className="guide-card__action guide-card__action--primary"
            onClick={() => onNavigate('value')}
          >
            Redeem Credits to USDT &rarr;
          </button>
        </div>
      </div>

      {/* ── Compliance & Legal Callout ── */}
      <div className="guide-compliance-banner">
        <div className="guide-compliance-icon" aria-hidden="true">&#9670;</div>
        <div>
          <h3 className="guide-compliance-title">100% Legitimate Architecture &amp; Compliance</h3>
          <p className="guide-compliance-text">
            Decant routes compute exclusively across open-weight models (Llama 3, Mistral), DePIN GPU solver clusters,
            and sanctioned upstream developer APIs. Decant strictly rejects gray-market scraping, credential reselling,
            and ToS violations of consumer chat subscriptions.
          </p>
        </div>
      </div>
    </div>
  );
}
