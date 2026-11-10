import { useCallback, useEffect, useState } from 'react';
import { requestJson, errorMessage } from '../api/client';
import { formatDateTime } from '../domain/format';
import { HonestBadge } from './HonestBadge';

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
  reviewer_role?: string;
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
        requestJson('/v1/reservations'),
        requestJson('/v1/reservation-reviews'),
      ]) as [{ reservations?: Reservation[] }, { reviews?: ReviewRecord[] }];
      if (!Array.isArray(pending.reservations) || !Array.isArray(audit.reviews)) throw new Error('Invalid reservation response.');
      setReservations(pending.reservations);
      setReviews(audit.reviews);
      setError(null);
    } catch (failure) {
      setReservations([]);
      setReviews([]);
      setError(errorMessage(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const input = Number(inputUnits);
  const output = Number(outputUnits);
  const valid = selected && inputUnits !== '' && outputUnits !== '' && stopped && reason.trim() && evidence.trim()
    && Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(output) && output >= 0
    && input + output <= selected.reserved_units;

  const totalCharged = input + output;
  const totalRefunded = selected ? selected.reserved_units - totalCharged : 0;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !selected || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await requestJson(`/v1/reservations/${encodeURIComponent(selected.request_id)}/review`, {
        method: 'POST',
        body: JSON.stringify({
          promptUnits: input,
          completionUnits: output,
          reason,
          evidenceReference: evidence,
          providerWorkStopped: stopped,
        }),
      }) as { review: { refundedUnits: number; usedUnits: number } };
      setMessage(`Review saved. Charged ${result.review.usedUnits} credits and returned ${result.review.refundedUnits} unused credits.`);
      setSelected(null);
      onReviewed();
      await refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function triggerAutoSettle() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await requestJson('/v1/reservations/auto-settle', {
        method: 'POST',
        body: JSON.stringify({ maxAgeMs: 10 * 60_000 }),
      }) as { settledCount: number };
      setMessage(`Auto-settled policy executed: ${res.settledCount} stalled reservations settled in operator's favor.`);
      onReviewed();
      await refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="reservation-review-title">
      <div className="section-subheading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 id="reservation-review-title" style={{ margin: 0 }}>Credit held for unfinished requests</h3>
          {reservations.length > 0 && (
            <span
              style={{
                background: 'rgba(234, 179, 8, 0.15)',
                color: '#eab308',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {reservations.length} Pending
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {reservations.length > 0 && (
            <button
              type="button"
              className="button button--secondary"
              disabled={busy || loading}
              onClick={triggerAutoSettle}
              title="Automatically settle stalled reservations older than 10 minutes in operator favor"
            >
              Auto-settle stale (&gt;10m)
            </button>
          )}
          <button type="button" className="button button--quiet" disabled={busy || loading} onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </div>

      <p className="field-note">
        Review the provider record first. A request must be at least five minutes old and its work must have stopped. Waiting alone does not prove that a refund is due.
      </p>

      {error && <p className="inline-error" role="alert">{error}</p>}
      {message && <p className="field-note" role="status" style={{ color: '#22c55e', fontWeight: 600 }}>{message}</p>}

      {loading ? (
        <p className="empty-note">Loading held credit…</p>
      ) : !error && reservations.length === 0 ? (
        <p className="empty-note">No unfinished reservations returned by the gateway. All streams cleanly settled.</p>
      ) : null}

      {reservations.length > 0 && (
        <div className="redemptions-table-wrap">
          <table className="mini-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Session</th>
                <th>Held credits</th>
                <th>Age</th>
                <th>Created</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((row) => {
                const ageMinutes = Math.floor((Date.now() - row.created_at) / 60_000);
                const eligible = ageMinutes >= 5;
                return (
                  <tr key={row.request_id}>
                    <td className="mono">{row.request_id}</td>
                    <td className="mono">{row.session_id}</td>
                    <td><strong>{row.reserved_units}</strong></td>
                    <td>{ageMinutes}m ago</td>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td>
                      <HonestBadge type={eligible ? 'Unverified' : 'Sandbox'} size="sm" />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button--quiet"
                        disabled={busy || !eligible}
                        onClick={() => {
                          setSelected(row);
                          setInputUnits('');
                          setOutputUnits('');
                          setReason('');
                          setEvidence('');
                          setStopped(false);
                          setMessage(null);
                        }}
                      >
                        {!eligible ? 'Wait 5m' : 'Review'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <form className="inline-form" onSubmit={submit} style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>
              Review Request: <code className="mono">{selected.request_id}</code>
            </span>
            <span className="mono" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              Ceiling: {selected.reserved_units} credits
            </span>
          </div>

          <label htmlFor="review-input-units">Reviewed prompt / input credits</label>
          <input
            id="review-input-units"
            type="number"
            min="0"
            step="1"
            required
            disabled={busy}
            value={inputUnits}
            onChange={(event) => setInputUnits(event.target.value)}
          />

          <label htmlFor="review-output-units">Reviewed completion / output credits</label>
          <input
            id="review-output-units"
            type="number"
            min="0"
            step="1"
            required
            disabled={busy}
            value={outputUnits}
            onChange={(event) => setOutputUnits(event.target.value)}
          />

          {/* Visual Settlement Diff Box */}
          {inputUnits !== '' && outputUnits !== '' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                padding: '12px',
                margin: '12px 0',
                borderRadius: '6px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                textAlign: 'center',
              }}
            >
              <div>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', display: 'block' }}>RESERVED</span>
                <strong className="mono">{selected.reserved_units}</strong>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#eab308', display: 'block' }}>TO CHARGE</span>
                <strong className="mono" style={{ color: '#eab308' }}>{totalCharged}</strong>
              </div>
              <div>
                <span style={{ fontSize: '10px', color: '#22c55e', display: 'block' }}>TO REFUND</span>
                <strong className="mono" style={{ color: '#22c55e' }}>{totalRefunded}</strong>
              </div>
            </div>
          )}

          <label htmlFor="review-reason">Reason for the decision</label>
          <textarea
            id="review-reason"
            required
            maxLength={1024}
            disabled={busy}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Gateway node restarted mid-generation; raw logs show 45 tokens generated before drop"
          />

          <label htmlFor="review-evidence">Provider record or evidence reference</label>
          <input
            id="review-evidence"
            type="text"
            required
            maxLength={2048}
            disabled={busy}
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            placeholder="e.g. cluster-logs/node-2/request-id.log or trace ID"
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 0' }}>
            <input
              type="checkbox"
              required
              disabled={busy}
              checked={stopped}
              onChange={(event) => setStopped(event.target.checked)}
            />
            I checked the provider record and confirmed this work has stopped.
          </label>

          <div className="action-row" style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button type="submit" className="button button--primary" disabled={!valid || busy}>
              {busy ? 'Saving…' : `Confirm Settlement (${totalCharged} charged · ${totalRefunded} refunded)`}
            </button>
            <button type="button" className="button button--quiet" disabled={busy} onClick={() => setSelected(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {reviews.length > 0 && (
        <details style={{ marginTop: '20px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
            Operator Review Audit Log ({reviews.length})
          </summary>
          <div className="redemptions-table-wrap" style={{ marginTop: '8px' }}>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Reason</th>
                  <th>Evidence Reference</th>
                  <th>Attested Role</th>
                  <th>Reviewed At</th>
                  <th>Verification</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((rev) => (
                  <tr key={rev.request_id}>
                    <td className="mono">{rev.request_id}</td>
                    <td>{rev.reason}</td>
                    <td className="mono" style={{ fontSize: '11px' }}>{rev.evidence_reference}</td>
                    <td><span className="mono">{rev.reviewer_role ?? 'operator'}</span></td>
                    <td>{formatDateTime(rev.reviewed_at)}</td>
                    <td><HonestBadge type="Verified" size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
