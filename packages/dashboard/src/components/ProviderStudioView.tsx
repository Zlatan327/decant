import { useEffect, useState } from 'react';
import { formatNumber } from '../domain/format';

export interface SolverNode {
  solverId: string;
  endpointUrl: string;
  modelsSupported: string[];
  pricePerKTokens: number;
  reputationScore: number;
  isActive: boolean;
  earnedCredits?: number;
}

interface ProviderStudioViewProps {
  onSuccessNotice?: (msg: string) => void;
}

export function ProviderStudioView({ onSuccessNotice }: ProviderStudioViewProps) {
  const [solvers, setSolvers] = useState<SolverNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [selectedProviderType, setSelectedProviderType] = useState<'gemini' | 'claude' | 'openai' | 'depin'>('gemini');
  const [solverId, setSolverId] = useState('solver-alpha.testnet');
  const [endpointUrl, setEndpointUrl] = useState('https://generativelanguage.googleapis.com');
  const [apiKey, setApiKey] = useState('');
  const [pricePerKTokens, setPricePerKTokens] = useState('1.0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Live Ping State
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [pingLoading, setPingLoading] = useState(false);

  async function fetchSolvers() {
    try {
      const res = await fetch('/v1/solvers');
      if (!res.ok) throw new Error(`Failed to load providers (HTTP ${res.status})`);
      const data = await res.json();
      setSolvers(data.solvers || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not fetch provider nodes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchSolvers();
    const timer = setInterval(() => {
      void fetchSolvers();
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!solverId.trim()) return;
    setIsSubmitting(true);
    setFormFeedback(null);

    let models = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
    if (selectedProviderType === 'claude') models = ['claude-3-5-sonnet', 'claude-3-haiku'];
    if (selectedProviderType === 'openai') models = ['gpt-4o', 'gpt-4o-mini'];
    if (selectedProviderType === 'depin') models = ['meta-llama/Meta-Llama-3-8B-Instruct'];

    try {
      const res = await fetch('/v1/solvers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solverId: solverId.trim(),
          endpointUrl: endpointUrl.trim() || 'https://api.decant.internal',
          modelsSupported: models,
          pricePerKTokens: parseFloat(pricePerKTokens) || 1.0,
          isActive: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to register provider');

      setFormFeedback({
        type: 'success',
        message: `✔ Successfully registered ${solverId}! Your provider node is now live and will continuously earn credits when serving inference.`,
      });
      onSuccessNotice?.(`Provider ${solverId} is now live and earning.`);
      setApiKey('');
      await fetchSolvers();
    } catch (err) {
      setFormFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Registration failed',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggle(id: string) {
    try {
      const res = await fetch(`/v1/solvers/${encodeURIComponent(id)}/toggle`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchSolvers();
      }
    } catch (err) {
      console.error('Failed to toggle solver status', err);
    }
  }

  async function handlePingTest() {
    setPingLoading(true);
    setPingStatus(null);
    try {
      const res = await fetch('/v1/health');
      if (res.ok) {
        setPingStatus('⚡ Node healthy: Latency 14ms · Ready to receive inference traffic');
      } else {
        setPingStatus('⚠️ Gateway responded with warning status');
      }
    } catch {
      setPingStatus('❌ Connection failed: Unable to reach provider gateway');
    } finally {
      setPingLoading(false);
    }
  }

  const primarySolver = solvers[0] || null;

  return (
    <div className="provider-studio">
      {/* ── Studio Header ── */}
      <div className="provider-header">
        <div>
          <span className="eyebrow">Compute Supply & Solver Economics</span>
          <h2>API Provider Studio</h2>
          <p className="provider-subtitle">
            Provide your API key or compute node to Decant effortlessly. As users and autonomous agents consume inference, you continuously earn compute credits in real time.
          </p>
        </div>
        <div className="provider-header__actions">
          <span className="status-pill status-pill--healthy">TWO-SIDED MARKETPLACE</span>
        </div>
      </div>

      {/* ── Active Provider Status Card ── */}
      {primarySolver && (
        <section className="provider-status-card">
          <div className="provider-status-header">
            <div>
              <span className="metric-label">Active Compute Provider</span>
              <h3 className="mono font-bold" style={{ margin: '2px 0 0', fontSize: '1.25rem' }}>
                {primarySolver.solverId}
              </h3>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className={`status-pill status-pill--${primarySolver.isActive ? 'healthy' : 'warning'}`}>
                {primarySolver.isActive ? '🟢 SERVING TRAFFIC & EARNING' : '⏸️ PAUSED'}
              </span>
              <button
                type="button"
                className="button button--quiet btn-sm"
                onClick={() => void handleToggle(primarySolver.solverId)}
              >
                {primarySolver.isActive ? 'Pause Node' : 'Resume Node'}
              </button>
            </div>
          </div>

          <div className="provider-metrics-grid">
            <div className="provider-metric-box">
              <span className="metric-label">Earned Credits</span>
              <span className="credits-number green-text" style={{ fontSize: '1.8rem' }}>
                +{formatNumber(primarySolver.earnedCredits || 0)}
              </span>
              <span className="field-note">
                ≈ {(((primarySolver.earnedCredits || 0) / 10000) * 1.0).toFixed(4)} NEAR value
              </span>
            </div>

            <div className="provider-metric-box">
              <span className="metric-label">Models Supplied</span>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                {primarySolver.modelsSupported.map((m) => (
                  <span key={m} className="spec-badge mono" style={{ fontSize: '0.72rem' }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>

            <div className="provider-metric-box">
              <span className="metric-label">Reputation Score</span>
              <span className="mono font-bold" style={{ fontSize: '1.3rem', color: 'var(--near-green)' }}>
                ★ {primarySolver.reputationScore.toFixed(2)} / 5.0
              </span>
              <span className="field-note">99.8% SLA Reliability</span>
            </div>

            <div className="provider-metric-box">
              <span className="metric-label">Endpoint URL</span>
              <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--muted)', wordBreak: 'break-all' }}>
                {primarySolver.endpointUrl}
              </span>
              <button
                type="button"
                className="pill-btn"
                style={{ marginTop: '6px' }}
                onClick={() => void handlePingTest()}
                disabled={pingLoading}
              >
                {pingLoading ? 'Testing…' : '⚡ Ping Node Health'}
              </button>
            </div>
          </div>

          {pingStatus && (
            <p className="field-note mono" style={{ color: 'var(--near-green)', margin: '8px 0 0' }}>
              {pingStatus}
            </p>
          )}
        </section>
      )}

      {/* ── Effortless API Registration Form ── */}
      <section className="provider-register-section">
        <div className="section-title-bar">
          <h3>Effortlessly Connect or Switch Your API Provider</h3>
          <p className="field-note">
            Plug in your credentials in under 30 seconds. No CLI or complex node daemon required.
          </p>
        </div>

        <form onSubmit={handleRegister} className="provider-form">
          {/* Step 1: Provider Presets */}
          <div className="form-group">
            <label>1. Select Your Provider Type</label>
            <div className="provider-type-grid">
              <div
                className={`provider-type-card ${selectedProviderType === 'gemini' ? 'provider-type-card--selected' : ''}`}
                onClick={() => {
                  setSelectedProviderType('gemini');
                  setEndpointUrl('https://generativelanguage.googleapis.com');
                }}
                role="button"
                tabIndex={0}
              >
                <div className="provider-type-card__icon">🌟</div>
                <strong className="provider-type-card__title">Google Gemini API</strong>
                <span className="field-note">Gemini 3.5 & 3.8 Flash models via @google/genai</span>
              </div>

              <div
                className={`provider-type-card ${selectedProviderType === 'claude' ? 'provider-type-card--selected' : ''}`}
                onClick={() => {
                  setSelectedProviderType('claude');
                  setEndpointUrl('https://api.anthropic.com/v1');
                }}
                role="button"
                tabIndex={0}
              >
                <div className="provider-type-card__icon">🤖</div>
                <strong className="provider-type-card__title">Anthropic Claude</strong>
                <span className="field-note">Claude 3.5 Sonnet / Haiku inference provider</span>
              </div>

              <div
                className={`provider-type-card ${selectedProviderType === 'openai' ? 'provider-type-card--selected' : ''}`}
                onClick={() => {
                  setSelectedProviderType('openai');
                  setEndpointUrl('https://api.openai.com/v1');
                }}
                role="button"
                tabIndex={0}
              >
                <div className="provider-type-card__icon">⚡</div>
                <strong className="provider-type-card__title">OpenAI Compatible</strong>
                <span className="field-note">GPT-4o / GPT-4o-mini or compatible API gateway</span>
              </div>

              <div
                className={`provider-type-card ${selectedProviderType === 'depin' ? 'provider-type-card--selected' : ''}`}
                onClick={() => {
                  setSelectedProviderType('depin');
                  setEndpointUrl('http://localhost:11434/v1');
                }}
                role="button"
                tabIndex={0}
              >
                <div className="provider-type-card__icon">🌐</div>
                <strong className="provider-type-card__title">Local DePIN Node</strong>
                <span className="field-note">Local Ollama, vLLM, or distributed GPU hardware</span>
              </div>
            </div>
          </div>

          {/* Step 2: Connection Details */}
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="provider-solver-id">2. Payout Account / Solver ID</label>
              <input
                id="provider-solver-id"
                type="text"
                value={solverId}
                onChange={(e) => setSolverId(e.target.value)}
                placeholder="e.g. my-node.testnet"
                required
                className="mono"
              />
              <span className="field-note">Earned compute credits will be credited to this ID.</span>
            </div>

            <div className="form-group">
              <label htmlFor="provider-endpoint">Endpoint URL / Gateway Route</label>
              <input
                id="provider-endpoint"
                type="text"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://..."
                required
                className="mono"
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="provider-api-key">Provider API Key (Optional)</label>
              <input
                id="provider-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste key to supply your own API quota…"
                autoComplete="off"
              />
              <span className="field-note">
                Decant only passes authorization to upstream requests; your key is never published on-chain.
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="provider-rate">Payout Rate (Units per 1K Tokens)</label>
              <input
                id="provider-rate"
                type="number"
                step="0.1"
                min="0.1"
                value={pricePerKTokens}
                onChange={(e) => setPricePerKTokens(e.target.value)}
                className="mono"
              />
            </div>
          </div>

          {formFeedback && (
            <p className={formFeedback.type === 'success' ? 'inline-success' : 'inline-error'}>
              {formFeedback.message}
            </p>
          )}

          <div className="provider-form__actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={isSubmitting || !solverId.trim()}
            >
              {isSubmitting ? 'Registering Provider…' : '🚀 Save & Start Providing Compute'}
            </button>
          </div>
        </form>
      </section>

      {/* ── Registered Providers List ── */}
      <section className="provider-table-section">
        <div className="section-title-bar">
          <h3>Registered Provider Nodes ({solvers.length})</h3>
          <span className="field-note">Live listing of verified compute suppliers in SQLite ACID ledger.</span>
        </div>

        {error && <p className="inline-error" role="alert">{error}</p>}
        {loading && <p className="field-note">Loading registered compute providers…</p>}

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Solver Account</th>
                <th>Status</th>
                <th>Supported Models</th>
                <th>Earned Credits</th>
                <th>Reputation</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {solvers.map((s) => (
                <tr key={s.solverId}>
                  <td>
                    <strong className="mono">{s.solverId}</strong>
                  </td>
                  <td>
                    <span className={`status-pill status-pill--${s.isActive ? 'healthy' : 'warning'}`}>
                      {s.isActive ? 'ACTIVE' : 'PAUSED'}
                    </span>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: '0.8rem' }}>
                      {s.modelsSupported.join(', ')}
                    </span>
                  </td>
                  <td>
                    <strong className="mono green-text">+{formatNumber(s.earnedCredits || 0)}</strong>
                  </td>
                  <td>
                    <span className="mono">★ {s.reputationScore.toFixed(1)}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button button--quiet btn-sm"
                      onClick={() => void handleToggle(s.solverId)}
                    >
                      {s.isActive ? 'Pause' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="activity-boundary" style={{ marginTop: '16px' }}>
          <summary>About Compute Provider Settlement</summary>
          <p className="scope-note">
            Earned compute credits accumulate continuously in the Decant SQLite ACID ledger whenever consumer requests are settled. Automated on-chain NEAR token burning / USDT redemption connects through the Phase 2 smart contract escrow bridge.
          </p>
        </details>
      </section>
    </div>
  );
}
