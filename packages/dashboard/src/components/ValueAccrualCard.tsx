import { useEffect, useState } from 'react';
import { formatDateTime, formatNumber } from '../domain/format';
import { targetAttributes } from './targets';

interface RedemptionRecord {
  redemptionId: string;
  accountId: string;
  creditsBurned: number;
  usdtAmountCents: number;
  usdtAmountFormatted: string;
  timestamp: number;
  status: string;
}

type Feedback = { type: 'success' | 'error'; message: string };
type EarningsStatus = 'idle' | 'loading' | 'ready' | 'refreshing' | 'error';
type RedemptionsStatus = 'loading' | 'ready' | 'error';

interface ValueAccrualCardProps {
  onSuccess?: (message: string) => void;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

export function ValueAccrualCard({ onSuccess }: ValueAccrualCardProps) {
  const [solverId, setSolverId] = useState('');
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const [earnedCredits, setEarnedCredits] = useState<number | null>(null);
  const [earningsStatus, setEarningsStatus] = useState<EarningsStatus>('idle');
  const [earningsError, setEarningsError] = useState<string | null>(null);
  const [redeemAmount, setRedeemAmount] = useState<number>(100);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);
  const [redemptionsStatus, setRedemptionsStatus] = useState<RedemptionsStatus>('loading');
  const [redemptionsError, setRedemptionsError] = useState<string | null>(null);

  async function fetchEarnings(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/v1/solvers/${encodeURIComponent(id)}/earnings`);
      if (!res.ok) throw new Error(`Earnings could not be loaded (HTTP ${res.status}).`);
      const data = await res.json();
      setEarnedCredits(data.earnedCredits ?? 0);
      setEarningsStatus('ready');
      setEarningsError(null);
      return true;
    } catch (error) {
      setEarningsStatus('error');
      setEarningsError(messageFrom(error));
      return false;
    }
  }

  async function fetchRedemptions(): Promise<void> {
    setRedemptionsStatus('loading');
    try {
      const res = await fetch('/v1/redemptions');
      if (!res.ok) throw new Error(`Redemption history could not be loaded (HTTP ${res.status}).`);
      const data = await res.json();
      if (!Array.isArray(data.redemptions)) throw new Error('The gateway returned an unexpected redemption-history response.');
      setRedemptions(data.redemptions);
      setRedemptionsStatus('ready');
      setRedemptionsError(null);
    } catch (error) {
      setRedemptionsStatus('error');
      setRedemptionsError(messageFrom(error));
    }
  }

  useEffect(() => {
    void fetchRedemptions();
  }, []);

  useEffect(() => {
    if (!loadedAccountId || solverId.trim() !== loadedAccountId) return;
    const interval = window.setInterval(() => {
      setEarningsStatus('refreshing');
      void fetchEarnings(loadedAccountId);
      void fetchRedemptions();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadedAccountId, solverId]);

  async function lookupAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = solverId.trim();
    if (!id || earningsStatus === 'loading') return;
    setEarningsStatus('loading');
    setEarningsError(null);
    setFeedback(null);
    setEarnedCredits(null);
    setLoadedAccountId(null);
    if (await fetchEarnings(id)) setLoadedAccountId(id);
  }

  async function handleRedeem() {
    if (!loadedAccountId || loadedAccountId !== solverId.trim() || earnedCredits === null) return;
    if (redeemAmount < 100) {
      setFeedback({ type: 'error', message: 'The minimum redemption is 100 credits ($0.10 USDT at the displayed rate).' });
      return;
    }
    if (redeemAmount > earnedCredits) {
      setFeedback({ type: 'error', message: `Cannot redeem ${formatNumber(redeemAmount)} credits; the loaded balance is ${formatNumber(earnedCredits)}.` });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/v1/solvers/${encodeURIComponent(loadedAccountId)}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: redeemAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Redemption failed.');
      const redemption = data.redemption;
      setFeedback({
        type: 'success',
        message: `Gateway returned ${redemption.status}: ${formatNumber(redemption.creditsBurned)} credits burned for $${redemption.usdtAmountFormatted} USDT. Redemption ID: ${redemption.redemptionId}`,
      });
      onSuccess?.(`Redeemed ${redemption.creditsBurned} credits for $${redemption.usdtAmountFormatted} USDT`);
      setEarningsStatus('refreshing');
      await Promise.all([fetchEarnings(loadedAccountId), fetchRedemptions()]);
    } catch (error) {
      setFeedback({ type: 'error', message: messageFrom(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSimulateWorkload() {
    if (!loadedAccountId || loadedAccountId !== solverId.trim() || isSimulating) return;
    setIsSimulating(true);
    setFeedback(null);
    try {
      const res = await fetch(`/v1/solvers/${encodeURIComponent(loadedAccountId)}/reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 500 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'The reward simulator could not be run.');
      setEarnedCredits(data.earnedCredits);
      setEarningsStatus('ready');
      setFeedback({ type: 'success', message: `The simulator added 500 credits to ${loadedAccountId}. This is simulated workload, not measured compute earnings.` });
      await fetchRedemptions();
    } catch (error) {
      setFeedback({ type: 'error', message: messageFrom(error) });
    } finally {
      setIsSimulating(false);
    }
  }

  const accountIsLoaded = loadedAccountId !== null && loadedAccountId === solverId.trim() && earnedCredits !== null && earningsStatus === 'ready';
  const usdtValue = earnedCredits === null ? null : (earnedCredits / 1000).toFixed(2);
  const redeemUsdt = (redeemAmount / 1000).toFixed(2);

  return (
    <section className="panel value-accrual-card" aria-labelledby="value-card-heading" {...targetAttributes('compute-to-value-card', 'panel')}>
      <div className="card-header">
        <div>
          <span className="card-eyebrow">VALUE</span>
          <h2 className="card-title" id="value-card-heading">Earnings and redemption</h2>
        </div>
        <span className="rate-badge mono">1,000 credits = $1.00 USDT</span>
      </div>

      <div className="value-accrual-body">
        <form className="value-account-form" onSubmit={lookupAccount}>
          <div className="value-field">
            <label htmlFor="solver-account-input" className="value-label">Solver / agent NEAR account</label>
            <p className="field-note">Look up an account before using its displayed balance.</p>
            <input
              id="solver-account-input"
              type="text"
              className="text-input mono"
              value={solverId}
              onChange={(event) => {
                setSolverId(event.target.value);
                setLoadedAccountId(null);
                setEarnedCredits(null);
                setEarningsStatus('idle');
                setEarningsError(null);
                setFeedback(null);
              }}
              placeholder="e.g. solver-node.near"
              autoComplete="off"
              required
            />
          </div>
          <button type="submit" className="button button--primary" disabled={!solverId.trim() || earningsStatus === 'loading'}>
            {earningsStatus === 'loading' ? 'Checking balance…' : 'Check balance'}
          </button>
        </form>

        {earningsStatus === 'error' && earningsError && (
          <p className="resource-message resource-message--warning" role="alert">{earningsError} Check the account ID and try again.</p>
        )}
        {earningsStatus === 'refreshing' && <p className="field-note" role="status">Refreshing account data…</p>}

        <div className="earnings-stats" aria-live="polite">
          <div className="stat-box">
            <span className="stat-label">Earned solver credits</span>
            <span className="stat-value stat-value--green mono">
              {earnedCredits === null ? '—' : formatNumber(earnedCredits)} <span className="stat-unit">credits</span>
            </span>
            <span className="field-note">{accountIsLoaded ? `Account: ${loadedAccountId}` : earningsStatus === 'error' && loadedAccountId ? 'Refresh failed; the last balance cannot be used for redemption.' : 'Check an account to load its balance.'}</span>
          </div>
          <div className="stat-box">
            <span className="stat-label">USDT estimate at displayed rate</span>
            <span className="stat-value stat-value--usdt mono">
              {usdtValue === null ? '—' : `≈ $${usdtValue}`} <span className="stat-unit">USDT</span>
            </span>
            <span className="field-note">An estimate; eligibility and settlement are separate.</span>
          </div>
        </div>

        <div className="redemption-control-box">
          <div className="redemption-control-header">
            <div>
              <label htmlFor="redeem-amount" className="value-label">Credits to burn</label>
              <p className="field-note">Minimum 100 credits · permanent once redeemed</p>
            </div>
            <div className="percentage-pills" aria-label="Choose a share of the loaded balance">
              {[25, 50, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="pill-btn"
                  onClick={() => earnedCredits !== null && setRedeemAmount(Math.min(earnedCredits, Math.max(100, Math.floor((earnedCredits * pct) / 100))))}
                  disabled={!accountIsLoaded || earnedCredits < 100}
                  aria-label={`Set redemption amount to ${pct} percent of balance`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <div className="value-redemption-input">
            <input
              id="redeem-amount"
              type="number"
              className="text-input mono"
              min={100}
              max={earnedCredits ?? undefined}
              step={1}
              value={redeemAmount}
              onChange={(event) => setRedeemAmount(Math.max(0, parseInt(event.target.value, 10) || 0))}
              disabled={!accountIsLoaded || isSubmitting}
              aria-describedby="redemption-consequence"
            />
            <span className="value-redemption-estimate mono">≈ ${redeemUsdt} USDT</span>
            <button
              type="button"
              className="button button--primary"
              onClick={handleRedeem}
              disabled={!accountIsLoaded || earnedCredits < 100 || redeemAmount > (earnedCredits ?? 0) || redeemAmount < 100 || isSubmitting}
            >
              {isSubmitting ? 'Submitting redemption…' : `Redeem ${formatNumber(redeemAmount)} credits`}
            </button>
          </div>
          <p id="redemption-consequence" className="field-note">Submitting permanently burns the selected credits. Review the amount and estimated USDT value first.</p>
        </div>

        {feedback && (
          <p className={`status-banner status-banner--${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>
            {feedback.message}
          </p>
        )}

        <details className="disclosure value-simulator">
          <summary>Test the reward simulator</summary>
          <p className="field-note">This separate test action calls the workload simulator and adds 500 credits. It is not measured compute earnings.</p>
          <button
            type="button"
            className="button button--quiet"
            onClick={handleSimulateWorkload}
            disabled={!accountIsLoaded || isSimulating}
            title="Call the existing simulator to add 500 credits to the loaded account"
          >
            {isSimulating ? 'Running simulator…' : 'Simulate +500 credits'}
          </button>
        </details>

        <div className="redemptions-history">
          <div>
            <h3 className="value-label">Redemption history</h3>
            <p className="field-note">Records returned by the gateway redemption-history endpoint; separate from the gateway credit transaction audit.</p>
          </div>
          {redemptionsStatus === 'loading' ? (
            <p className="empty-hint" role="status">Loading redemption history…</p>
          ) : redemptionsStatus === 'error' ? (
            <p className="resource-message resource-message--warning" role="alert">{redemptionsError ?? 'Redemption history is unavailable.'}</p>
          ) : redemptions.length === 0 ? (
            <p className="empty-hint">No redemption records were returned.</p>
          ) : (
            <div className="redemptions-table-wrap" role="region" aria-label="Recent redemptions; scroll horizontally on small screens" tabIndex={0}>
              <table className="mini-table mono">
                <caption className="sr-only">Recent solver credit redemptions returned by the gateway</caption>
                <thead>
                  <tr>
                    <th scope="col">Redemption ID</th>
                    <th scope="col">Account</th>
                    <th scope="col">Credits burned</th>
                    <th scope="col">USDT amount</th>
                    <th scope="col">Status</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.slice(0, 5).map((record) => (
                    <tr key={record.redemptionId}>
                      <td className="table-highlight" title={record.redemptionId}>{record.redemptionId}</td>
                      <td title={record.accountId}>{record.accountId}</td>
                      <td>{formatNumber(record.creditsBurned)}</td>
                      <td className="table-usdt">${record.usdtAmountFormatted}</td>
                      <td><span className="badge badge--settled">{record.status}</span></td>
                      <td><time dateTime={new Date(record.timestamp).toISOString()}>{formatDateTime(record.timestamp)}</time></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
