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
        <h1 className="guide-title">Protocol overview</h1>
        <p className="guide-lead">
          Route AI requests through a configured provider and track credit use in the gateway ledger.
          NEAR settlement and token payouts still need integration.
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
            An operator registers an agent public key and credit allowance. Agents sign requests with
            their session key. This operator console uses the operator credential instead.
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
            Agents can record compute requests and operators can assign a solver. Assignment does not prove
            completion, run inference, or issue rewards. Verified solver execution is still needed.
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
            Credit is reserved before calling the provider. After the request ends, the gateway records estimated
            usage and returns unused credit. Requests without enough available credit receive HTTP 402.
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
            Solver credit records are local accounting entries. Rewards need verified completed work.
            USDT payouts are unavailable until a funded token-transfer service is connected.
          </p>
          <div className="guide-card__code mono">
            <code>POST /v1/solvers/:id/redeem</code>
            <span className="code-sub">Unavailable — no credits are burned</span>
          </div>
          <button
            type="button"
            className="guide-card__action guide-card__action--primary"
            onClick={() => onNavigate('value')}
          >
            View Recorded Credits &rarr;
          </button>
        </div>
      </div>

      {/* ── Compliance & Legal Callout ── */}
      <div className="guide-compliance-banner">
        <div className="guide-compliance-icon" aria-hidden="true">&#9670;</div>
        <div>
          <h3 className="guide-compliance-title">Provider access</h3>
          <p className="guide-compliance-text">
            Configure a provider endpoint and model that you are authorized to use. Provider keys stay on the gateway.
            Provider failures return errors; there is no scripted answer fallback.
          </p>
        </div>
      </div>
    </div>
  );
}
