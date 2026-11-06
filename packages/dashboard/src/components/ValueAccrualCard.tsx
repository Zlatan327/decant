import { useState, useEffect } from 'react';
import { requestJson, errorMessage } from '../api/client';
import { targetAttributes } from './targets';

interface RedemptionRecord {
  redemptionId: string;
  accountId: string;
  creditsBurned: number;
  usdtAmountFormatted: string;
}

export function ValueAccrualCard(_props: { onSuccess?: (message: string) => void }) {
  const [solverId, setSolverId] = useState('');
  const [earnedCredits, setEarnedCredits] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);

  useEffect(() => {
    let active = true;
    setEarnedCredits(null);
    setFeedback(null);
    const refresh = async () => {
      if (!solverId.trim()) return;
      try {
        const payload = await requestJson(`/v1/solvers/${encodeURIComponent(solverId.trim())}/earnings`) as { earnedCredits?: unknown };
        if (!Number.isSafeInteger(payload.earnedCredits) || Number(payload.earnedCredits) < 0) throw new Error('Gateway returned an invalid credit balance.');
        const history = await requestJson('/v1/redemptions') as { redemptions?: RedemptionRecord[] };
        if (!Array.isArray(history.redemptions)) throw new Error('Gateway returned an invalid record list.');
        if (active) {
          setEarnedCredits(Number(payload.earnedCredits));
          setRedemptions(history.redemptions.filter(r => r.accountId === solverId.trim()));
          setFeedback(null);
        }
      } catch (error) {
        if (active) { setEarnedCredits(null); setRedemptions([]); setFeedback(errorMessage(error)); }
      }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [solverId]);

  return (
    <div className="card value-accrual-card" {...targetAttributes('compute-to-value-card', 'panel')}>
      <div className="card-header">
        <div><span className="card-eyebrow">SOLVER ACCOUNTING</span><h3 className="card-title">Recorded solver credits</h3></div>
      </div>
      <div className="value-accrual-body">
        <div className="value-field">
          <label htmlFor="solver-account-input" className="value-label">Solver account</label>
          <input id="solver-account-input" type="text" className="text-input mono" value={solverId}
            onChange={event => setSolverId(event.target.value)} placeholder="Enter a solver account" />
        </div>
        <div className="earnings-stats">
          <div className="stat-box"><span className="stat-label">Credits in the gateway ledger</span>
            <span className="stat-value mono">{earnedCredits === null ? '—' : earnedCredits.toLocaleString()}</span>
          </div>
        </div>
        <div className="redemption-control-box">
          <p className="field-hint">Rewards need verified completed work. USDT payouts are not connected. Recorded credits are not a confirmed token balance or payout.</p>
          <button className="btn btn--primary" type="button" disabled>USDT payouts unavailable</button>
        </div>
        {feedback && <p className="inline-error" role="alert">{feedback}</p>}
        <div className="redemptions-history">
          <span className="value-label">Earlier local redemption records</span>
          <p className="field-hint">These records do not prove that USDT was transferred.</p>
          {redemptions.length === 0 ? <p className="empty-hint">No records loaded for this account.</p> : (
            <div className="redemptions-table-wrap"><table className="mini-table mono">
              <thead><tr><th>Record ID</th><th>Credits</th><th>Transfer status</th></tr></thead>
              <tbody>{redemptions.slice(0, 5).map(record => <tr key={record.redemptionId}>
                <td>{record.redemptionId}</td><td>{record.creditsBurned}</td><td>Unverified</td>
              </tr>)}</tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  );
}
