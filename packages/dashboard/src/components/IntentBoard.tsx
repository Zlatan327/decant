import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { formatDateTime, formatNumber, shortIdentifier } from '../domain/format';
import type { ApiResource, IntentRecord, SessionRecord } from '../domain/types';
import { targetAttributes } from './targets';

interface IntentBoardProps {
  intents: ApiResource<IntentRecord[]>;
  confirmedIntents: IntentRecord[];
  sessions: ApiResource<SessionRecord[]>;
  selectedSessionId: string | null;
  onBroadcast: (input: { sessionId: string; model: string; maxBudget: number }) => Promise<IntentRecord>;
  onFill: (intentId: string, solverId: string) => Promise<IntentRecord>;
}

const modelOptions = ['gemini-3.8-flash', 'meta-llama/Meta-Llama-3-8B-Instruct'] as const;

function IntentCard({
  intent,
  onFill,
}: {
  intent: IntentRecord;
  onFill: (intentId: string, solverId: string) => Promise<IntentRecord>;
}) {
  const [solverId, setSolverId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!solverId.trim() || pending) return;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await onFill(intent.intentId, solverId.trim());
      setSuccess(`The gateway returned status: ${result.status}.`);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="intent-card" {...targetAttributes('open-intent-card', 'card')}>
      <div className="intent-card__header">
        <strong className="mono" title={intent.intentId}>{shortIdentifier(intent.intentId, 10)}</strong>
        <span className="status-pill status-pill--warning" data-status={intent.status}>{intent.status}</span>
      </div>
      <dl className="intent-card__details">
        <div><dt>Requested model</dt><dd>{intent.model}</dd></div>
        <div><dt>Session</dt><dd className="mono" title={intent.sessionId}>{shortIdentifier(intent.sessionId, 8)}</dd></div>
        <div><dt>Budget cap</dt><dd className="mono">{formatNumber(intent.maxBudget)} units</dd></div>
        <div><dt>Broadcast</dt><dd>{formatDateTime(intent.createdAt)}</dd></div>
      </dl>
      <form className="inline-form inline-form--compact" onSubmit={submit} {...targetAttributes('fill-intent-form', 'panel')}>
        <label htmlFor={`solver-${intent.intentId}`}>Solver ID</label>
        <div className="action-row">
          <input
            id={`solver-${intent.intentId}`}
            type="text"
            value={solverId}
            onChange={(event) => { setSolverId(event.target.value); setSuccess(null); }}
            placeholder="Enter solver ID"
            autoComplete="off"
            required
            data-render-target="fill-intent-solver-id"
            data-motion-trigger="interaction"
          />
          <button className="button button--primary button--small" type="submit" disabled={pending} data-render-target="submit-intent-fill" data-motion-trigger="interaction">
            {pending ? 'Submitting…' : 'Fill intent'}
          </button>
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        {success && <p className="inline-success" role="status">{success}</p>}
      </form>
    </li>
  );
}

function ConfirmedIntent({ intent }: { intent: IntentRecord }) {
  const dateLabel = intent.status === 'filled' ? 'Filled' : 'Last lifecycle timestamp';
  return (
    <li className="confirmed-intent" {...targetAttributes('confirmed-intent-record', 'list-item')}>
      <span className="mono" title={intent.intentId}>{shortIdentifier(intent.intentId, 9)}</span>
      <span>{intent.solverId ? `Solver ${intent.solverId}` : intent.status}</span>
      <time dateTime={new Date(intent.filledAt ?? intent.createdAt).toISOString()}>{dateLabel} {formatDateTime(intent.filledAt ?? intent.createdAt)}</time>
    </li>
  );
}

export function IntentBoard({ intents, confirmedIntents, sessions, selectedSessionId, onBroadcast, onFill }: IntentBoardProps) {
  const [sessionId, setSessionId] = useState(selectedSessionId ?? '');
  const [model, setModel] = useState<string>(modelOptions[0]);
  const [maxBudget, setMaxBudget] = useState('100');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);
  const returnedIntents = intents.data ?? [];
  const openIntents = returnedIntents.filter((intent) => intent.status === 'open');
  const confirmedById = new Map<string, IntentRecord>();
  for (const intent of returnedIntents) {
    if (intent.status !== 'open') confirmedById.set(intent.intentId, intent);
  }
  for (const intent of confirmedIntents) confirmedById.set(intent.intentId, intent);
  const lifecycleRecords = [...confirmedById.values()];
  const filled = lifecycleRecords.filter((intent) => intent.status === 'filled');
  const settled = lifecycleRecords.filter((intent) => intent.status === 'settled');
  const expiredCount = lifecycleRecords.filter((intent) => intent.status === 'expired').length;

  useEffect(() => {
    if (selectedSessionId) setSessionId(selectedSessionId);
  }, [selectedSessionId]);

  async function submitBroadcast(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const budget = Number(maxBudget);
    if (!sessionId || !Number.isInteger(budget) || budget < 1 || pending) return;
    setPending(true);
    setError(null);
    setBroadcastSuccess(null);
    try {
      const result = await onBroadcast({ sessionId, model, maxBudget: budget });
      setBroadcastSuccess(`Gateway returned ${result.status} for intent ${shortIdentifier(result.intentId, 14)}.`);
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel intent-panel" aria-labelledby="intent-heading" {...targetAttributes('intent-lifecycle-board', 'panel')}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ACTIVE WORK</p>
          <h2 id="intent-heading">Open intents</h2>
        </div>
        <span className="source-badge">Gateway list</span>
      </div>
      <p className="panel-intro">Open items are returned by the gateway. Enter a solver ID to record a local assignment. This does not run inference.</p>

      <section className="intent-lane intent-lane--primary" aria-labelledby="open-intents-heading" {...targetAttributes('open-intents-lane', 'panel')}>
        <div className="intent-lane__heading"><h3 id="open-intents-heading">Available to fill</h3><span className="mono">{intents.data === null ? '—' : formatNumber(openIntents.length)}</span></div>
        {intents.message && <p className={`resource-message${intents.status === 'error' || intents.status === 'unavailable' || intents.status === 'stale' ? ' resource-message--warning' : ''}`} role={intents.status === 'error' ? 'alert' : 'status'}>{intents.message}</p>}
        <ul className="intent-list">
          {openIntents.map((intent) => <IntentCard key={intent.intentId} intent={intent} onFill={onFill} />)}
        </ul>
        {intents.data !== null && openIntents.length === 0 && <p className="empty-note">No open intents were returned. You can create one below if needed.</p>}
        {intents.data === null && !intents.message && <p className="empty-note">{intents.status === 'loading' ? 'Loading open intents…' : 'Open intents are unavailable.'}</p>}
      </section>

      <div className="intent-lanes-secondary">
        <section className="intent-lane" aria-labelledby="filled-intents-heading" {...targetAttributes('filled-intents-lane', 'panel')}>
          <div className="intent-lane__heading"><h3 id="filled-intents-heading">Filled</h3><span className="mono">{formatNumber(filled.length)}</span></div>
          {filled.length > 0
            ? <ul className="confirmed-intent-list">{filled.map((intent) => <ConfirmedIntent key={intent.intentId} intent={intent} />)}</ul>
            : <p className="empty-note">No filled records returned. Confirmations from this console appear here; an open-only list cannot enumerate all filled intents.</p>}
        </section>

        <section className="intent-lane" aria-labelledby="settled-intents-heading" {...targetAttributes('settled-intents-lane', 'panel')}>
          <div className="intent-lane__heading"><h3 id="settled-intents-heading">Settled</h3><span className="mono">{formatNumber(settled.length)}</span></div>
          {settled.length > 0
            ? <ul className="confirmed-intent-list">{settled.map((intent) => <ConfirmedIntent key={intent.intentId} intent={intent} />)}</ul>
            : <p className="empty-note">The supplied API has no settled-intent list endpoint, so no settlement status or timestamp is inferred.</p>}
        </section>
      </div>
      {expiredCount > 0 && <p className="scope-note">{formatNumber(expiredCount)} expired intent records were returned but are outside the filled and settled lists.</p>}

      <details className="broadcast-disclosure">
        <summary>Create a new intent</summary>
        <p className="field-note">This creates a gateway intent record; it does not start automatic solver matching.</p>
        <form className="broadcast-form" onSubmit={submitBroadcast} {...targetAttributes('broadcast-intent-form', 'panel')}>
          <div className="broadcast-form__fields">
            <div className="form-field">
              <label htmlFor="intent-session">Session</label>
              <select id="intent-session" value={sessionId} onChange={(event) => setSessionId(event.target.value)} required data-render-target="intent-session-select" data-motion-trigger="interaction">
                <option value="" disabled>Select a session</option>
                {(sessions.data ?? []).map((session) => <option key={session.sessionId} value={session.sessionId}>{session.sessionId}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="intent-model">Model</label>
              <select id="intent-model" value={model} onChange={(event) => setModel(event.target.value)} data-render-target="intent-model-select" data-motion-trigger="interaction">
                {modelOptions.map((modelName) => <option key={modelName} value={modelName}>{modelName}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="intent-budget">Maximum budget (units)</label>
              <input id="intent-budget" type="number" min="1" step="1" inputMode="numeric" value={maxBudget} onChange={(event) => setMaxBudget(event.target.value)} required data-render-target="intent-max-budget" data-motion-trigger="interaction" />
            </div>
            <button type="submit" className="button button--primary" disabled={pending || !sessions.data?.length} data-render-target="submit-intent-broadcast" data-motion-trigger="interaction">
              {pending ? 'Creating intent…' : 'Create intent'}
            </button>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          {broadcastSuccess && <p className="inline-success" role="status">{broadcastSuccess}</p>}
        </form>
      </details>
    </section>
  );
}
