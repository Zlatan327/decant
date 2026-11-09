import { useState } from 'react';
import { errorMessage } from '../api/client';
import { generateAgentIdentity, type AgentIdentity } from '../domain/identity';
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
  onSuspend?: (sessionId: string) => Promise<unknown>;
  onResume?: (sessionId: string) => Promise<unknown>;
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
  onSuspend,
  onResume,
}: {
  session: SessionRecord;
  selected: boolean;
  tracked: boolean;
  onSelect: (sessionId: string) => void;
  onUntrack: (sessionId: string) => void;
  onTopUp: (sessionId: string, amount: number) => Promise<SessionRecord>;
  onSuspend?: (sessionId: string) => Promise<unknown>;
  onResume?: (sessionId: string) => Promise<unknown>;
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

  async function handleToggleSuspend() {
    setPending(true);
    setError(null);
    try {
      if (status === 'suspended') {
        if (onResume) await onResume(session.sessionId);
      } else {
        if (onSuspend) await onSuspend(session.sessionId);
      }
    } catch (toggleError) {
      setError(errorMessage(toggleError));
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
          {(onSuspend || onResume) && (
            <button
              type="button"
              className={`button button--small ${status === 'suspended' ? 'button--primary' : 'button--quiet'}`}
              onClick={handleToggleSuspend}
              disabled={pending}
              title={status === 'suspended' ? 'Re-enable this session key' : 'Emergency kill switch: suspend key immediately'}
            >
              {status === 'suspended' ? 'Resume' : 'Suspend'}
            </button>
          )}
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
      {error && <p className="inline-error" role="alert" style={{ margin: '6px 0 0' }}>{error}</p>}
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
          <span className="mono">-{formatNumber(transaction.costUnits)}</span>
          <span className="metric-label">{transaction.model}</span>
          <span className="metric-label mono">{formatDateTime(transaction.timestamp)}</span>
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
  onSuspend,
  onResume,
}: SessionPanelProps) {
  const [trackInput, setTrackInput] = useState('');
  const [trackError, setTrackError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [ownerAccountId, setOwnerAccountId] = useState('');
  const [quota, setQuota] = useState('100');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [generatedIdentity, setGeneratedIdentity] = useState<AgentIdentity | null>(null);

  const records = sessions.data ?? [];
  const returnedIds = new Set(records.map((record) => record.sessionId));
  const unresolvedTrackedIds = trackedSessionIds.filter((id) => !returnedIds.has(id));
  const detail = sessionDetail.data?.session;
  const detailTransactions = sessionDetail.data?.transactions ?? [];

  async function handleGenerateKeys() {
    try {
      const identity = await generateAgentIdentity();
      setGeneratedIdentity(identity);
      setSessionId(identity.sessionId);
      setPublicKey(identity.publicKey);
      setRegisterOpen(true);
    } catch (failure) {
      setRegisterOpen(true);
      setRegisterError(errorMessage(failure));
    }
  }

  function submitTracking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = trackInput.trim();
    if (!clean) return;
    if (trackedSessionIds.includes(clean)) {
      setTrackError('This session ID is already tracked.');
      return;
    }
    setTrackError(null);
    onTrack(clean);
    setTrackInput('');
  }

  async function submitRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quotaValue = Number(quota);
    if (!sessionId.trim() || !publicKey.trim() || !Number.isInteger(quotaValue) || quotaValue < 1 || registering) return;
    setRegistering(true);
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
      setQuota('100');
      setRegisterOpen(false);
    } catch (error) {
      setRegisterError(errorMessage(error));
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="panel" {...targetAttributes('agent-session-panel', 'panel')}>
      <div className="panel__header">
        <div>
          <h3>Sessions & Cryptographic Keys</h3>
          <p className="panel__desc">Agent identities, remaining credit, and kill switches.</p>
        </div>
        <div className="action-row">
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={handleGenerateKeys}
            title="Generate a new Ed25519 keypair for autonomous agents"
          >
            Generate Keypair
          </button>
          <button
            type="button"
            className="button button--primary button--small"
            onClick={() => { setRegisterOpen((open) => !open); setRegisterError(null); }}
            data-render-target="open-register-session"
            data-motion-trigger="interaction"
          >
            {registerOpen ? 'Cancel' : 'Register session'}
          </button>
        </div>
      </div>

      {generatedIdentity && (
        <div className="generated-key-banner" style={{ background: 'rgba(0, 236, 151, 0.08)', border: '1px solid rgba(0, 236, 151, 0.25)', borderRadius: '10px', padding: '12px 14px', margin: '14px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong style={{ color: 'var(--near-green)', fontSize: '0.82rem' }}>Session key generated</strong>
            <button type="button" className="button button--quiet button--small" onClick={() => setGeneratedIdentity(null)}>Dismiss</button>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.8)' }}>
            <strong>Private Key (Save now — shown once):</strong>
          </p>
          <code style={{ display: 'block', padding: '6px 8px', background: 'rgba(0, 0, 0, 0.4)', borderRadius: '6px', fontSize: '0.75rem', wordBreak: 'break-all', color: '#00EC97', marginBottom: '8px' }}>
            {generatedIdentity.privateKey}
          </code>
        </div>
      )}

      {registerOpen && (
        <form className="stacked-form" onSubmit={submitRegister} {...targetAttributes('register-session-form', 'panel')}>
          <div className="form-group">
            <label htmlFor="reg-session-id">Session ID</label>
            <input
              id="reg-session-id"
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="e.g. agent-autonomous-01"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="reg-public-key">Ed25519 Public Key (ed25519:...)</label>
            <input
              id="reg-public-key"
              type="text"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder="ed25519:Base58EncodedPublicKey"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="reg-owner">Owner Account (Optional)</label>
            <input
              id="reg-owner"
              type="text"
              value={ownerAccountId}
              onChange={(e) => setOwnerAccountId(e.target.value)}
              placeholder="agent.testnet"
            />
          </div>
          <div className="form-group">
            <label htmlFor="reg-quota">Initial Quota (Credit Units)</label>
            <input
              id="reg-quota"
              type="number"
              min="1"
              step="1"
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
              required
            />
          </div>
          {registerError && <p className="inline-error">{registerError}</p>}
          <div className="action-row">
            <button type="submit" className="button button--primary" disabled={registering}>
              {registering ? 'Enrolling…' : 'Confirm Enrollment'}
            </button>
          </div>
        </form>
      )}

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
            onSuspend={onSuspend}
            onResume={onResume}
          />
        ))}
      </ul>

      {records.length === 0 && (
        <div className="empty-state" data-render-target="sessions-empty-state" data-motion-trigger="status">
          <p className="empty-state__title">{sessions.status === 'loading' ? 'Connecting to session registry' : 'No session records available'}</p>
          <p className="empty-state__body">
            {sessions.message ?? 'Enroll an agent session key above to grant inference credits.'}
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
            placeholder="Enter session ID to track"
            data-render-target="track-session-input"
            data-motion-trigger="interaction"
          />
          <button className="button button--quiet button--small" type="submit" disabled={!trackInput.trim()} data-render-target="submit-track-session" data-motion-trigger="interaction">
            Track
          </button>
        </div>
        {trackError && <p className="inline-error" role="alert">{trackError}</p>}
      </form>

      {selectedSessionId && (
        <div className="session-detail-pane" {...targetAttributes('selected-session-detail', 'panel')}>
          <div className="session-detail-pane__header">
            <h4>Selected session detail</h4>
            <span className="mono">{shortIdentifier(selectedSessionId, 10)}</span>
          </div>
          {sessionDetail.status === 'loading' && <p className="empty-note">Loading detail from `GET /v1/sessions/:id`.</p>}
          {sessionDetail.message && !detail && <p className="resource-message resource-message--warning" role="status">{sessionDetail.message}</p>}
          {detail && (
            <>
              <p className="field-note">Detail refreshed {formatDateTime(sessionDetail.checkedAt)} · {detailTransactions.length} transactions returned by the gateway.</p>
              <RecentTransactions transactions={detailTransactions} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
