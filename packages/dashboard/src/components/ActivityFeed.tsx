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
  source: 'Gateway ledger' | 'This console';
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
    title: 'Inference transaction returned',
    detail: `Requested ${transaction.model} · ${formatNumber(transaction.promptTokens)} prompt + ${formatNumber(transaction.completionTokens)} completion tokens · ${formatNumber(transaction.costUnits)} cost units · ${formatNumber(transaction.upstreamLatencyMs)} ms upstream`,
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
  const ledgerScope = transactions.scope === 'global'
    ? 'Global ledger snapshot'
    : transactions.scope === 'per-session'
      ? 'Session-scoped snapshot'
      : 'Ledger unavailable';

  let emptyTitle = 'No activity returned';
  let emptyDescription = 'No gateway ledger rows or console-observed events are available in this view.';
  if (transactions.status === 'loading' && events.length === 0) {
    emptyTitle = 'Loading recent activity';
    emptyDescription = 'Waiting for the gateway transaction snapshot.';
  } else if ((transactions.status === 'error' || transactions.status === 'unavailable') && events.length === 0) {
    emptyTitle = 'Gateway ledger unavailable';
    emptyDescription = 'The ledger snapshot could not be loaded. Console observations are limited to actions made here.';
  } else if (transactions.status === 'stale' && events.length === 0) {
    emptyTitle = 'No current activity available';
    emptyDescription = 'The most recent gateway snapshot could not be refreshed.';
  }

  return (
    <section className="panel activity-panel" aria-labelledby="activity-heading" {...targetAttributes('observed-activity-feed', 'panel')}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">RECENT ACTIVITY</p>
          <h2 id="activity-heading">Observed records</h2>
        </div>
        <span className="source-badge">{ledgerScope}</span>
      </div>
      <p className="panel-intro">Gateway ledger means a transaction row returned by the API. This console means an action or HTTP error observed here.</p>
      {resourceMessage && <p className={`resource-message${messageTone}`} role={transactions.status === 'error' ? 'alert' : 'status'}>{resourceMessage}</p>}
      {rows.length === 0 ? (
        <div className="empty-state" data-render-target="activity-empty-state" data-motion-trigger="status">
          <p className="empty-state__title">{emptyTitle}</p>
          <p className="empty-state__body">{emptyDescription}</p>
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
                  <span className={`source-label source-label--${row.source === 'Gateway ledger' ? 'ledger' : 'console'}`}>{row.source}</span>
                </div>
                <p>{row.detail}</p>
                <div className="activity-item__meta">
                  {row.sessionId && <code title={row.sessionId} aria-label={row.sessionId}>{shortIdentifier(row.sessionId, 8)}</code>}
                  {row.httpStatus !== null && <span className="mono">HTTP {row.httpStatus}</span>}
                  <time dateTime={new Date(row.timestamp).toISOString()}>{formatDateTime(row.timestamp)}</time>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <details className="activity-boundary">
        <summary>About activity coverage</summary>
        <p className="scope-note">A ledger model field reflects the request model recorded at settlement, not necessarily the provider model that produced SSE; check the live inference response for that. Rejected requests from other agents are not available here without a gateway event endpoint.</p>
      </details>
    </section>
  );
}
