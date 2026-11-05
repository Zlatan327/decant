import { useState, useEffect } from 'react';
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

interface ValueAccrualCardProps {
  onSuccess?: (message: string) => void;
}

export function ValueAccrualCard({ onSuccess }: ValueAccrualCardProps) {
  const [solverId, setSolverId] = useState('solver-default.near');
  const [earnedCredits, setEarnedCredits] = useState<number>(1250);
  const [redeemAmount, setRedeemAmount] = useState<number>(500);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);

  // Fetch current solver earnings
  const fetchEarnings = async (id: string) => {
    try {
      const res = await fetch(`/v1/solvers/${encodeURIComponent(id)}/earnings`);
      if (res.ok) {
        const data = await res.json();
        setEarnedCredits(data.earnedCredits ?? 0);
      }
    } catch {
      // Fallback in case of network glitch
    }
  };

  // Fetch recent redemptions
  const fetchRedemptions = async () => {
    try {
      const res = await fetch('/v1/redemptions');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.redemptions)) {
          setRedemptions(data.redemptions);
        }
      }
    } catch {
      // Quiet fail
    }
  };

  useEffect(() => {
    fetchEarnings(solverId);
    fetchRedemptions();
    const interval = window.setInterval(() => {
      fetchEarnings(solverId);
      fetchRedemptions();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [solverId]);

  // Handle redemption
  const handleRedeem = async () => {
    if (redeemAmount < 100) {
      setFeedback({ type: 'error', message: 'Minimum redemption is 100 credits ($0.10 USDT)' });
      return;
    }
    if (redeemAmount > earnedCredits) {
      setFeedback({ type: 'error', message: `Cannot redeem ${redeemAmount} credits; balance is ${earnedCredits}` });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/v1/solvers/${encodeURIComponent(solverId)}/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: redeemAmount }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Redemption failed');
      }

      setFeedback({
        type: 'success',
        message: `Burned ${data.redemption.creditsBurned} credits for $${data.redemption.usdtAmountFormatted} USDT on NEAR. Tx: ${data.redemption.redemptionId}`,
      });
      onSuccess?.(`Redeemed ${data.redemption.creditsBurned} DECANT → $${data.redemption.usdtAmountFormatted} USDT`);
      fetchEarnings(solverId);
      fetchRedemptions();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick workload reward simulator for judges / reviewers
  const handleSimulateWorkload = async () => {
    try {
      const res = await fetch(`/v1/solvers/${encodeURIComponent(solverId)}/reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 500 }),
      });
      if (res.ok) {
        const data = await res.json();
        setEarnedCredits(data.earnedCredits);
        setFeedback({
          type: 'success',
          message: `Simulated DePIN workload fulfillment: +500 DECANT credits credited to ${solverId}`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const usdtValue = (earnedCredits / 1000).toFixed(2);
  const redeemUsdt = (redeemAmount / 1000).toFixed(2);

  return (
    <div className="card value-accrual-card" {...targetAttributes('compute-to-value-card', 'panel')}>
      <div className="card-header">
        <div>
          <span className="card-eyebrow">COMPUTE-TO-VALUE ENGINE · TRACK 07</span>
          <h3 className="card-title">Solver Earnings &amp; USDT Redemption</h3>
        </div>
        <span className="rate-badge mono">1,000 Credits = $1.00 USDT</span>
      </div>

      <div className="value-accrual-body">
        {/* Account Selector */}
        <div className="value-field">
          <label htmlFor="solver-account-input" className="value-label">
            Solver / Agent NEAR Account
          </label>
          <div className="input-group">
            <input
              id="solver-account-input"
              type="text"
              className="text-input mono"
              value={solverId}
              onChange={(e) => setSolverId(e.target.value.trim())}
              placeholder="e.g. solver-node.near"
            />
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleSimulateWorkload}
              title="Add 500 credits to simulate fulfilled compute intent"
            >
              +500 Earned Credits
            </button>
          </div>
        </div>

        {/* Live Balance Counter */}
        <div className="earnings-stats">
          <div className="stat-box">
            <span className="stat-label">Earned Compute Balance</span>
            <span className="stat-value stat-value--green mono">
              {earnedCredits.toLocaleString()} <span className="stat-unit">DECANT</span>
            </span>
          </div>
          <div className="stat-box">
            <span className="stat-label">Estimated Spendable Value</span>
            <span className="stat-value stat-value--usdt mono">
              ≈ ${usdtValue} <span className="stat-unit">USDT</span>
            </span>
          </div>
        </div>

        {/* Redemption Controls */}
        <div className="redemption-control-box">
          <div className="redemption-control-header">
            <span className="value-label">Burn Credits to Redeem USDT</span>
            <div className="percentage-pills">
              {[25, 50, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className="pill-btn"
                  onClick={() => setRedeemAmount(Math.max(100, Math.floor((earnedCredits * pct) / 100)))}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          <div className="input-group">
            <input
              type="number"
              className="text-input mono"
              min={100}
              max={earnedCredits}
              step={50}
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleRedeem}
              disabled={isSubmitting || earnedCredits < 100 || redeemAmount > earnedCredits}
            >
              {isSubmitting ? 'Burning on NEAR...' : `Redeem ≈ $${redeemUsdt} USDT`}
            </button>
          </div>
          <p className="field-hint">
            Burns compute tokens permanently on NEAR and generates an atomic redemption audit record.
          </p>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div className={`status-banner status-banner--${feedback.type} mono`}>
            {feedback.message}
          </div>
        )}

        {/* Recent Redemptions Ledger */}
        <div className="redemptions-history">
          <span className="value-label">On-Chain Settlement Audit Trail</span>
          {redemptions.length === 0 ? (
            <p className="empty-hint">No redemptions recorded yet on this gateway instance.</p>
          ) : (
            <div className="redemptions-table-wrap">
              <table className="mini-table mono">
                <thead>
                  <tr>
                    <th>Redemption ID</th>
                    <th>Account</th>
                    <th>Credits Burned</th>
                    <th>USDT Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.slice(0, 5).map((r) => (
                    <tr key={r.redemptionId}>
                      <td className="table-highlight">{r.redemptionId}</td>
                      <td>{r.accountId}</td>
                      <td>{r.creditsBurned.toLocaleString()}</td>
                      <td className="table-usdt">${r.usdtAmountFormatted}</td>
                      <td>
                        <span className="badge badge--settled">{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
