import { useCallback, useEffect, useState } from 'react';
import { requestJson, errorMessage } from '../api/client';
import { formatDateTime } from '../domain/format';

interface Reservation {
  request_id: string;
  session_id: string;
  reserved_units: number;
  created_at: number;
}
interface ReviewRecord {
  request_id: string;
  reason: string;
  evidence_reference: string;
  reviewed_at: number;
}

export function ReservationReviewPanel({ onReviewed }: { onReviewed: () => void }) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [inputUnits, setInputUnits] = useState('');
  const [outputUnits, setOutputUnits] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [stopped, setStopped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, audit] = await Promise.all([
        requestJson('/v1/reservations'), requestJson('/v1/reservation-reviews'),
      ]) as [{ reservations?: Reservation[] }, { reviews?: ReviewRecord[] }];
      if (!Array.isArray(pending.reservations) || !Array.isArray(audit.reviews)) throw new Error('Invalid reservation response.');
      setReservations(pending.reservations); setReviews(audit.reviews); setError(null);
    } catch (failure) { setReservations([]); setReviews([]); setError(errorMessage(failure)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const input = Number(inputUnits);
  const output = Number(outputUnits);
  const valid = selected && inputUnits !== '' && outputUnits !== '' && stopped && reason.trim() && evidence.trim()
    && Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(output) && output >= 0
    && input + output <= selected.reserved_units;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !selected || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await requestJson(`/v1/reservations/${encodeURIComponent(selected.request_id)}/review`, {
        method: 'POST', body: JSON.stringify({ promptUnits: input, completionUnits: output,
          reason, evidenceReference: evidence, providerWorkStopped: stopped }),
      }) as { review: { refundedUnits: number; usedUnits: number } };
      setMessage(`Review saved. Charged ${result.review.usedUnits} credits and returned ${result.review.refundedUnits} unused credits.`);
      setSelected(null); onReviewed(); await refresh();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }

  return <section className="panel" aria-labelledby="reservation-review-title">
    <div className="section-subheading">
      <h3 id="reservation-review-title">Credit held for unfinished requests</h3>
      <button type="button" className="button button--quiet" disabled={busy || loading} onClick={() => void refresh()}>Refresh</button>
    </div>
    <p className="field-note">Review the provider record first. A request must be at least five minutes old and its work must have stopped. Waiting alone does not prove that a refund is due.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {message && <p className="field-note" role="status">{message}</p>}
    {loading ? <p className="empty-note">Loading held credit…</p> : !error && reservations.length === 0 ? <p className="empty-note">No unfinished reservations returned by the gateway.</p> : null}
    {reservations.length > 0 && <div className="redemptions-table-wrap"><table className="mini-table">
      <thead><tr><th>Request</th><th>Session</th><th>Held credits</th><th>Created</th><th>Action</th></tr></thead>
      <tbody>{reservations.map(row => <tr key={row.request_id}>
        <td className="mono">{row.request_id}</td><td>{row.session_id}</td><td>{row.reserved_units}</td><td>{formatDateTime(row.created_at)}</td>
        <td><button type="button" className="button button--quiet" disabled={busy || Date.now() - row.created_at < 300_000}
          onClick={() => { setSelected(row); setInputUnits(''); setOutputUnits(''); setReason(''); setEvidence(''); setStopped(false); setMessage(null); }}>
          {Date.now() - row.created_at < 300_000 ? 'Wait before review' : 'Review'}
        </button></td>
      </tr>)}</tbody>
    </table></div>}
    {selected && <form className="inline-form" onSubmit={submit}>
      <p className="field-note">Request {selected.request_id}. This will update its gateway credit balance.</p>
      <label htmlFor="review-input-units">Reviewed input credits</label>
      <input id="review-input-units" type="number" min="0" step="1" required disabled={busy} value={inputUnits} onChange={event => setInputUnits(event.target.value)} />
      <label htmlFor="review-output-units">Reviewed output credits</label>
      <input id="review-output-units" type="number" min="0" step="1" required disabled={busy} value={outputUnits} onChange={event => setOutputUnits(event.target.value)} />
      <label htmlFor="review-reason">Reason for the decision</label>
      <textarea id="review-reason" required maxLength={1024} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} />
      <label htmlFor="review-evidence">Provider record or evidence reference</label>
      <input id="review-evidence" type="text" required maxLength={2048} disabled={busy} value={evidence} onChange={event => setEvidence(event.target.value)} />
      <label><input type="checkbox" required disabled={busy} checked={stopped} onChange={event => setStopped(event.target.checked)} /> I checked the provider record and confirmed this work has stopped.</label>
      <p className="field-note">Saved as your operator review. The gateway does not independently verify the evidence reference.</p>
      <div className="action-row">
        <button type="submit" className="button button--primary" disabled={!valid || busy}>{busy ? 'Saving…' : 'Save reviewed usage'}</button>
        <button type="button" className="button button--quiet" disabled={busy} onClick={() => setSelected(null)}>Cancel</button>
      </div>
    </form>}
    {reviews.length > 0 && <details><summary>Recent operator reviews</summary>
      <ul>{reviews.slice(0, 20).map(row => <li key={row.request_id}>
        <span className="mono">{row.request_id}</span> — {row.reason}. Evidence: {row.evidence_reference}. {formatDateTime(row.reviewed_at)}.
      </li>)}</ul>
    </details>}
  </section>;
}
