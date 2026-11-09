import type { DashboardSection } from './SidebarNav';
import { targetAttributes } from './targets';

interface HowItWorksViewProps {
  onNavigate: (section: DashboardSection) => void;
}

interface GuideStep {
  num: string;
  tag: string;
  title: string;
  description: string;
  endpoint: string;
  codeSnippet: string;
  actionLabel: string;
  targetSection: DashboardSection;
  featured?: boolean;
}

const STEPS: GuideStep[] = [
  {
    num: '01',
    tag: 'OPERATOR AUTH',
    title: 'Authenticate Operator Session',
    description:
      'Connect the operator credential to manage sessions, credit quotas, and recovery. The key is kept strictly in React memory for the page visit and is never saved to browser storage or leaked into frontend builds.',
    endpoint: 'X-Decant-Admin-Key: <DECANT_ADMIN_KEY>',
    codeSnippet: 'Bearer authorization for operator-only endpoints',
    actionLabel: 'Connect & View Telemetry →',
    targetSection: 'evidence',
  },
  {
    num: '02',
    tag: 'IDENTITY & QUOTAS',
    title: 'Enroll Agent & Allocate Credit',
    description:
      'Register an Ed25519 agent public key and bind it to a NEAR account identifier (e.g. agent-01.testnet) with an allotted compute quota. Sessions are stored in SQLite and track remaining versus total credit.',
    endpoint: 'POST /v1/sessions/register',
    codeSnippet: '{ "sessionId": "agent-01", "quota": 1000, "ownerAccountId": "agent.testnet" }',
    actionLabel: 'Manage Sessions & Quotas →',
    targetSection: 'identity',
  },
  {
    num: '03',
    tag: 'INFERENCE TUNNEL',
    title: 'Stream Real-Time Provider Tokens',
    description:
      'Select a funded session and an active upstream model (e.g. gemini-3.5-flash). The client signs the request using Ed25519 headers; the gateway reserves maximum credits upfront and streams live token chunks via SSE.',
    endpoint: 'POST /v1/chat/completions',
    codeSnippet: '{ "model": "gemini-3.5-flash", "messages": [{ "role": "user", "content": "..." }], "stream": true }',
    actionLabel: 'Open Inference Console →',
    targetSection: 'request',
    featured: true,
  },
  {
    num: '04',
    tag: 'ZERO-TRUST SAFEGUARDS',
    title: 'Circuit Breakers & Anti-Tamper',
    description:
      'The gateway enforces hard security boundaries: depleted balances halt compute with HTTP 402 Payment Required; tampered payloads or invalid signatures reject with HTTP 403; requests over 4KB reject with HTTP 413.',
    endpoint: 'HARD GATES: HTTP 402 · 403 · 413 · 429',
    codeSnippet: 'Anti-hallucination payload caps, token buckets, and replay rejection',
    actionLabel: 'Verify Circuit Breakers →',
    targetSection: 'request',
  },
  {
    num: '05',
    tag: 'SOLVER MARKETPLACE',
    title: 'Broadcast & Match Compute Intents',
    description:
      'Autonomous agents broadcast compute intent requirements (target model, budget, parameters) to the open registry. Decentralized solver nodes match and lock commitments to fulfill workloads.',
    endpoint: 'POST /v1/intents/broadcast',
    codeSnippet: '{ "model": "gemini-3.5-flash", "maxBudget": 200 }',
    actionLabel: 'Explore Intent Marketplace →',
    targetSection: 'routing',
  },
  {
    num: '06',
    tag: 'ACID ACCOUNTING',
    title: 'Double-Entry Ledger & Recovery',
    description:
      'Inspect persistent SQLite WAL-mode transaction records. If a gateway restarts or network drops mid-stream, the Reservation Review Panel surfaces stranded holds (>5 min) for audited operator usage settlement.',
    endpoint: 'GET /v1/reservations · POST /v1/reservations/:id/review',
    codeSnippet: 'Atomic usage settlement, unused credit refund, and operator audit trail',
    actionLabel: 'Audit Transaction Ledger →',
    targetSection: 'accounting',
    featured: true,
  },
];

export function HowItWorksView({ onNavigate }: HowItWorksViewProps) {
  return (
    <div className="workspace-view how-it-works-view" {...targetAttributes('how-it-works-view', 'panel')}>
      {/* ── Editorial Guide Hero ── */}
      <div className="guide-hero">
        <div className="guide-hero__badge mono">
          <span className="guide-hero__dot" aria-hidden="true" />
          <span>OPERATOR &amp; AGENT WORKFLOW</span>
        </div>
        <h2 className="guide-title">
          How to use <em>Decant</em>
        </h2>
        <p className="guide-lead">
          Register a session, send a request to an AI model, and track the credits it uses.
        </p>

        {/* ── Quick-Start CLI Snippet ── */}
        <div className="guide-quickstart">
          <div className="guide-quickstart__header">
            <span className="mono">TERMINAL QUICK START</span>
            <span className="guide-quickstart__env mono">NODE.JS 24 · REAL PROVIDER STREAM</span>
          </div>
          <div className="guide-quickstart__cmd mono">
            <code>npm run simulate</code>
            <span className="guide-quickstart__note">Executes an isolated 1,000 credit agent harness with real Google Gemini streaming</span>
          </div>
        </div>
      </div>

      {/* ── 6-Step Workflow Cards Grid ── */}
      <div className="guide-steps-grid">
        {STEPS.map((step) => (
          <div
            key={step.num}
            className={`guide-card ${step.featured ? 'guide-card--featured' : ''}`}
          >
            <div className="guide-card__header">
              <span className="guide-card__num mono">{step.num}</span>
              <span className="guide-card__tag mono">{step.tag}</span>
            </div>

            <h2 className="guide-card__title">{step.title}</h2>
            <p className="guide-card__text">{step.description}</p>

            <div className="guide-card__code mono">
              <code>{step.endpoint}</code>
              <span className="code-sub">{step.codeSnippet}</span>
            </div>

            <button
              type="button"
              className={`guide-card__action ${step.featured ? 'guide-card__action--primary' : ''}`}
              onClick={() => onNavigate(step.targetSection)}
            >
              {step.actionLabel}
            </button>
          </div>
        ))}
      </div>

      {/* ── Operational Callout / Honest Boundaries ── */}
      <div className="guide-compliance-banner">
        <div className="guide-compliance-icon" aria-hidden="true">&#9670;</div>
        <div>
          <h3 className="guide-compliance-title">Verified Protocol Boundaries</h3>
          <p className="guide-compliance-text">
            Gateway credit metering uses character-based units (<code>ceil(characters / 4)</code>) backed by local SQLite WAL transactions.
            A Rust NEAR contract is provided for future on-chain synchronization; reward minting and token payout redemptions remain safely paused
            until verified work proofs and audited transfer rails are deployed.
          </p>
        </div>
      </div>
    </div>
  );
}
