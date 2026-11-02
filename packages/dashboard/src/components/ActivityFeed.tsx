import { formatDateTime, formatNumber, shortIdentifier } from '../domain/format';
import type { ApiResource, ObservedEvent, TransactionRecord } from '../domain/types';
import { targetAttributes } from './targets';

interface ActivityFeedProps {
  transactions: ApiResource<TransactionRecord[]>;
  events: ObservedEvent[];
}

interface FeedRow {
  id: string;
  timestamp: number;
  source: string;
  level: 'success' | 'warning' | 'blocked' | 'info';
  title: string;
  detail: string;
  sessionId: string | null;
  httpStatus: number | null;
}

export function ActivityFeed({ transactions, events }: ActivityFeedProps) {
  const ledgerRows: FeedRow[] = (transactions.data ?? []).map((transaction) => ({
    id: `ledger-${transaction.txId}`,
    timestamp: transaction.timestamp,
    source: 'Gateway ledger',
    level: 'success',
    title: 'Inference transaction recorded',
    detail: `${transaction.model} · ${formatNumber(transaction.promptTokens + transaction.completionTokens)} tokens · ${formatNumber(transaction.costUnits)} credit units · ${formatNumber(transaction.upstreamLatencyMs)} ms upstream`,
    sessionId: transaction.sessionId,
    httpStatus: null,
  }));
  const consoleRows: FeedRow[] = events.map((event) => ({
    id: event.id,
    timestamp: event.timestamp,
    source: 'This console',
    level: event.level,
    title: event.title,
    detail: event.detail,
    sessionId: event.sessionId,
    httpStatus: event.httpStatus,
  }));
  const rows = [...ledgerRows, ...consoleRows]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 12);
  const resourceMessage = transactions.message;
  const messageTone = transactions.status === 'error' || transactions.status === 'unavailable' || transactions.status === 'stale'
    ? ' resource-message--warning'
    : '';

  return (
    <section className="panel activity-panel" aria-labelledby="activity-heading" {...targetAttributes('observed-activity-feed', 'panel')}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Observed evidence</p>
          <h2 id="activity-heading">Gateway activity</h2>
        </div>
        <span className="source-badge">{transactions.scope === 'global' ? 'GLOBAL LEDGER' : transactions.scope === 'per-session' ? 'SCOPED LEDGER' : 'NO LEDGER FEED'}</span>
      </div>
      {resourceMessage && <p className={`resource-message${messageTone}`} role={transactions.status === 'error' ? 'alert' : 'status'}>{resourceMessage}</p>}
      {rows.length === 0 ? (
        <div className="empty-state" data-render-target="activity-empty-state" data-motion-trigger="status">
          <p className="empty-state__title">No activity observed yet</p>
          <p className="empty-state__body">This feed uses returned ledger records and actions or HTTP errors observed by this console. It does not invent network traffic or claim a global rejection stream.</p>
        </div>
      ) : (
        <ol className="activity-list">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`activity-item activity-item--${row.level}`}
              {...targetAttributes('gateway-activity-event', 'list-item')}
              data-event-source={row.source === 'Gateway ledger' ? 'ledger' : 'console'}
              data-http-status={row.httpStatus ?? undefined}
            >
              <span className={`activity-marker activity-marker--${row.level}`} aria-hidden="true" />
              <div className="activity-item__body">
                <div className="activity-item__heading">
                  <strong>{row.title}</strong>
                  <span className="source-label">{row.source}</span>
                </div>
                <p>{row.detail}</p>
                <div className="activity-item__meta">
                  {row.sessionId && <code title={row.sessionId}>{shortIdentifier(row.sessionId, 8)}</code>}
                  {row.httpStatus !== null && <span className="mono">HTTP {row.httpStatus}</span>}
                  <time dateTime={new Date(row.timestamp).toISOString()}>{formatDateTime(row.timestamp)}</time>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="scope-note">A global feed of rejected requests requires a gateway event endpoint; only console-observed errors appear here.</p>
    </section>
  );
}
