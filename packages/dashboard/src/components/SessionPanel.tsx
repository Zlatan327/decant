import { useState } from 'react';
import { errorMessage } from '../api/client';
import { MAX_TRACKED_SESSIONS } from '../domain/constants';
import { formatDateTime, formatNumber, quotaPercent, shortIdentifier } from '../domain/format';
import type { ApiResource, RegisterSessionInput, SessionDetail, SessionRecord, TransactionRecord } from '../domain/types';
import { targetAttributes } from './targets';

interface SessionPanelProps {
  sessions: ApiResource<SessionRecord[]>;
  sessionDetail: ApiResource<SessionDetail>;
  selectedSessionId: string | null;
  trackedSessionIds: string[];
  onSelect: (sessionId: string) => void;
  onTrack: (sessionId: string) => void;
  onUntrack: (sessionId: string) => void;
  onRegister: (input: RegisterSessionInput) => Promise<SessionRecord>;
  onTopUp: (sessionId: string, amount: number) => Promise<SessionRecord>;
}

function statusClass(status: string): string {
  if (status === 'active') return 'status-pill--healthy';
  if (status === 'exhausted') return 'status-pill--blocked';
  if (status === 'suspended') return 'status-pill--warning';
  return 'status-pill--neutral';
}

function quotaTone(percent: number): string {
  if (percent <= 0) return 'quota-progress--exhausted';
  if (percent < 15) return 'quota-progress--warning';
  return '';
}

function SessionCard({
  session,
  selected,
  tracked,
  onSelect,
  onUntrack,
  onTopUp,
}: {
  session: SessionRecord;
  selected: boolean;
  tracked: boolean;
  onSelect: (sessionId: string) => void;
  onUntrack: (sessionId: string) => void;
  onTopUp: (sessionId: string, amount: number) => Promise<SessionRecord>;
}) {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const percent = quotaPercent(session.remainingQuota, session.totalQuota);
  const status = String(session.status);

  async function submitTopUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = Number(amount);
    if (!Number.isInteger(parsed) || parsed < 1 || pending) return;
    setPending(true);
    setError(null);
    try {
      await onTopUp(session.sessionId, parsed);
      setAmount('');
      setTopUpOpen(false);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className={`session-card${selected ? ' session-card--selected' : ''}`} {...targetAttributes('agent-session-card', 'card')}>
      <div className="session-card__header">
        <button
          type="button"
          className="session-select"
          onClick={() => onSelect(session.sessionId)}
          aria-pressed={selected}
          data-render-target="select-agent-session"
          data-motion-trigger="interaction"
        >
          <span className="session-select__name mono">{shortIdentifier(session.sessionId, 10)}</span>
          <span className="sr-only">{selected ? 'Selected session' : 'Select session'}</span>
        </button>
        <span className={`status-pill ${statusClass(status)}`} data-status={status}>{status}</span>
      </div>
      <div className="session-card__identity">
        <span className="metric-label">Owner</span>
        <span className="mono session-card__owner" title={session.ownerAccountId}>{session.ownerAccountId || 'Not supplied'}</span>
      </div>
      <div className="session-card__key">
        <span className="metric-label">Public key</span>
        <code title={session.publicKey}>{shortIdentifier(session.publicKey, 12)}</code>
      </div>
      <div className="quota-block" {...targetAttributes('session-quota-track', 'status')}>
        <div className="quota-block__labels">
          <span>Quota remaining</span>
          <strong className="mono">{formatNumber(session.remainingQuota)} <span className="muted">/ {formatNumber(session.totalQuota)}</span></strong>
        </div>
        <progress
          className={`quota-progress ${quotaTone(percent)}`.trim()}
          value={Math.max(0, Math.min(session.totalQuota, session.remainingQuota))}
          max={Math.max(1, session.totalQuota)}
          aria-label={`${formatNumber(session.remainingQuota)} of ${formatNumber(session.totalQuota)} quota units remaining`}
        />
        <span className="quota-percent mono">{Math.round(percent)}% available</span>
      </div>
      <div className="session-card__footer">
        <span className="metric-label">Registered {formatDateTime(session.createdAt)}</span>
        <div className="action-row">
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={() => { setTopUpOpen((open) => !open); setError(null); }}
            data-render-target="open-session-topup"
            data-motion-trigger="interaction"
          >
            {topUpOpen ? 'Close' : 'Add quota'}
          </button>
          {tracked && (
            <button
              type="button"
              className="button button--quiet button--small"
              onClick={() => onUntrack(session.sessionId)}
              aria-label={`Stop tracking ${session.sessionId} in this browser`}
              data-render-target="untrack-session"
              data-motion-trigger="interaction"
            >
              Untrack
            </button>
          )}
        </div>
      </div>
      {topUpOpen && (
        <form className="inline-form inline-form--compact" onSubmit={submitTopUp} {...targetAttributes('session-topup-form', 'panel')}>
          <label htmlFor={`topup-${session.sessionId}`}>Quota units to add</label>
          <div className="action-row">
            <input
              id={`topup-${session.sessionId}`}
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              data-render-target="session-topup-amount"
              data-motion-trigger="interaction"
            />
            <button className="button button--primary button--small" type="submit" disabled={pending} data-render-target="submit-session-topup" data-motion-trigger="interaction">
              {pending ? 'Submitting…' : 'Confirm'}
            </button>
          </div>
          <p className="field-note">This calls the gateway top-up endpoint for this session.</p>
          {error && <p className="inline-error" role="alert">{error}</p>}
        </form>
      )}
    </li>
  );
}

function RecentTransactions({ transactions }: { transactions: TransactionRecord[] }) {
  if (transactions.length === 0) return <p className="empty-note">No transaction records returned for this session.</p>;
  return (
    <ol className="detail-transaction-list">
      {transactions.slice(0, 3).map((transaction) => (
        <li key={transaction.txId} {...targetAttributes('session-recent-transaction', 'list-item')}>
          <span className="mono">{shortIdentifier(transaction.txId, 7)}</span>
          <span>{formatNumber(transaction.costUnits)} credit units</span>
          <time dateTime={new Date(transaction.timestamp).toISOString()}>{formatDateTime(transaction.timestamp)}</time>
        </li>
      ))}
    </ol>
  );
}

export function SessionPanel({
  sessions,
  sessionDetail,
  selectedSessionId,
  trackedSessionIds,
  onSelect,
  onTrack,
  onUntrack,
  onRegister,
  onTopUp,
}: SessionPanelProps) {
  const [trackInput, setTrackInput] = useState('');
  const [trackError, setTrackError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [ownerAccountId, setOwnerAccountId] = useState('');
  const [quota, setQuota] = useState('10000');
  const [registerPending, setRegisterPending] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const records = sessions.data ?? [];
  const detail = sessionDetail.data?.session.sessionId === selectedSessionId ? sessionDetail.data : null;
  const detailTransactions = detail ? [...detail.transactions].sort((a, b) => b.timestamp - a.timestamp) : [];
  const knownIds = new Set(records.map((record) => record.sessionId));
  const unresolvedTrackedIds = trackedSessionIds.filter((id) => !knownIds.has(id));
  const sourceLabel = sessions.scope === 'global'
    ? 'GLOBAL REGISTRY'
    : sessions.scope === 'tracked'
      ? 'EXPLICIT TRACK ONLY'
      : 'REGISTRY UNAVAILABLE';

  function submitTracking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = trackInput.trim();
    if (!normalized) return;
    if (!trackedSessionIds.includes(normalized) && trackedSessionIds.length >= MAX_TRACKED_SESSIONS) {
      setTrackError(`This browser retains up to ${MAX_TRACKED_SESSIONS} explicit session IDs. Untrack one before adding another.`);
      return;
    }
    setTrackError(null);
    onTrack(normalized);
    setTrackInput('');
  }

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quotaValue = Number(quota);
    if (!sessionId.trim() || !publicKey.trim() || !Number.isInteger(quotaValue) || quotaValue < 1 || registerPending) return;
    setRegisterPending(true);
    setRegisterError(null);
    try {
      await onRegister({
        sessionId: sessionId.trim(),
        publicKey: publicKey.trim(),
        ...(ownerAccountId.trim() ? { ownerAccountId: ownerAccountId.trim() } : {}),
        quota: quotaValue,
      });
      setSessionId('');
      setPublicKey('');
      setOwnerAccountId('');
      setRegisterOpen(false);
    } catch (error) {
      setRegisterError(errorMessage(error));
    } finally {
      setRegisterPending(false);
    }
  }

  return (
    <section className="panel session-panel" aria-labelledby="sessions-heading" {...targetAttributes('agent-session-panel', 'panel')}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Identity / credit</p>
          <h2 id="sessions-heading">Agent sessions</h2>
        </div>
        <div className="session-panel__summary">
          <span className="source-badge">{sourceLabel}</span>
          <span className="panel-count mono">{sessions.data === null ? '—' : formatNumber(records.length)}</span>
        </div>
      </div>

      {sessions.message && (
        <p className={`resource-message${sessions.status === 'error' || sessions.status === 'unavailable' || sessions.status === 'stale' ? ' resource-message--warning' : ''}`} role={sessions.status === 'error' ? 'alert' : 'status'}>
          {sessions.message}
        </p>
      )}

      <ul className="session-list">
        {records.map((session) => (
          <SessionCard
            key={session.sessionId}
            session={session}
            selected={session.sessionId === selectedSessionId}
            tracked={trackedSessionIds.includes(session.sessionId)}
            onSelect={onSelect}
            onUntrack={onUntrack}
            onTopUp={onTopUp}
          />
        ))}
      </ul>

      {records.length === 0 && (
        <div className="empty-state" data-render-target="sessions-empty-state" data-motion-trigger="status">
          <p className="empty-state__title">{sessions.status === 'loading' ? 'Connecting to session registry' : 'No session records available'}</p>
          <p className="empty-state__body">
            {sessions.message ?? 'Session data appears here only after the gateway returns it or you track a known session ID.'}
          </p>
        </div>
      )}

      {unresolvedTrackedIds.length > 0 && (
        <div className="tracked-id-list" {...targetAttributes('unresolved-session-id-list', 'panel')}>
          <p className="metric-label">Tracked IDs not returned as session records</p>
          {unresolvedTrackedIds.map((id) => (
            <div className="tracked-id-row" key={id}>
              <code title={id}>{shortIdentifier(id, 12)}</code>
              <button type="button" className="button button--quiet button--small" onClick={() => onUntrack(id)} aria-label={`Remove tracked session ID ${id}`} data-render-target="remove-unresolved-session-id" data-motion-trigger="interaction">Remove</button>
            </div>
          ))}
        </div>
      )}

      <form className="track-session-form" onSubmit={submitTracking} {...targetAttributes('track-existing-session-form', 'panel')}>
        <label htmlFor="track-session-id">Track an existing session ID</label>
        <div className="action-row">
          <input
            id="track-session-id"
            type="text"
            value={trackInput}
            onChange={(event) => setTrackInput(event.target.value)}
            placeholder="Paste an exact session ID"
            autoComplete="off"
            maxLength={200}
            data-render-target="track-session-id-input"
            data-motion-trigger="interaction"
          />
          <button type="submit" className="button button--quiet" disabled={!trackInput.trim()} data-render-target="track-session-submit" data-motion-trigger="interaction">Track</button>
        </div>
        <p className="field-note">Explicit IDs are stored in this browser only, up to {MAX_TRACKED_SESSIONS}. No private key is requested.</p>
        {trackError && <p className="inline-error" role="alert">{trackError}</p>}
      </form>

      <details className="disclosure" open={registerOpen} onToggle={(event) => setRegisterOpen(event.currentTarget.open)}>
        <summary data-render-target="toggle-session-registration" data-motion-trigger="interaction">Register a session</summary>
        <form className="form-stack" onSubmit={submitRegistration} {...targetAttributes('register-session-form', 'panel')}>
          <label htmlFor="register-session-id">Session ID</label>
          <input id="register-session-id" type="text" value={sessionId} onChange={(event) => setSessionId(event.target.value)} autoComplete="off" required maxLength={200} data-render-target="register-session-id" data-motion-trigger="interaction" />
          <label htmlFor="register-public-key">Agent public key</label>
          <input id="register-public-key" type="text" value={publicKey} onChange={(event) => setPublicKey(event.target.value)} autoComplete="off" required maxLength={512} data-render-target="register-session-public-key" data-motion-trigger="interaction" />
          <p className="field-note">Only the public key is sent. This dashboard never asks for the agent's private signing key.</p>
          <label htmlFor="register-owner-id">Owner account ID <span className="muted">(optional)</span></label>
          <input id="register-owner-id" type="text" value={ownerAccountId} onChange={(event) => setOwnerAccountId(event.target.value)} autoComplete="off" maxLength={200} data-render-target="register-session-owner" data-motion-trigger="interaction" />
          <label htmlFor="register-quota">Initial quota units</label>
          <input id="register-quota" type="number" min="1" step="1" inputMode="numeric" value={quota} onChange={(event) => setQuota(event.target.value)} required data-render-target="register-session-quota" data-motion-trigger="interaction" />
          {registerError && <p className="inline-error" role="alert">{registerError}</p>}
          <button type="submit" className="button button--primary" disabled={registerPending} data-render-target="submit-session-registration" data-motion-trigger="interaction">
            {registerPending ? 'Registering…' : 'Register with gateway'}
          </button>
        </form>
      </details>

      {selectedSessionId && (
        <div className="session-detail" {...targetAttributes('selected-session-detail', 'panel')}>
          <div className="section-subheading">
            <h3>Selected session detail</h3>
            <span className="mono">{shortIdentifier(selectedSessionId, 10)}</span>
          </div>
          {sessionDetail.status === 'loading' && <p className="empty-note">Loading detail from `GET /v1/sessions/:id`…</p>}
          {sessionDetail.message && !detail && <p className="resource-message resource-message--warning" role="status">{sessionDetail.message}</p>}
          {detail && (
            <>
              <p className="field-note">Detail refreshed {formatDateTime(sessionDetail.checkedAt)} · {detailTransactions.length} transactions returned by the gateway.</p>
              <RecentTransactions transactions={detailTransactions} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
