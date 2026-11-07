import { useMemo, useState } from 'react';
import { formatDateTime, formatNumber, shortIdentifier } from '../domain/format';
import type { ApiResource, TransactionRecord } from '../domain/types';
import { targetAttributes } from './targets';

const PAGE_SIZE = 25;

interface TransactionAuditProps {
  transactions: ApiResource<TransactionRecord[]>;
}

export function TransactionAudit({ transactions }: TransactionAuditProps) {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const rows = transactions.data ?? [];
  const normalizedFilter = filter.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!normalizedFilter) return rows;
    return rows.filter((transaction) => [transaction.txId, transaction.sessionId, transaction.model]
      .some((value) => value.toLowerCase().includes(normalizedFilter)));
  }, [normalizedFilter, rows]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const firstRow = filteredRows.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const lastRow = Math.min((currentPage + 1) * PAGE_SIZE, filteredRows.length);
  const scopeLabel = transactions.scope === 'global'
    ? 'Global snapshot'
    : transactions.scope === 'per-session'
      ? 'Session-scoped'
      : 'Scope unavailable';
  const resourceMessage = transactions.message;
  const messageTone = transactions.status === 'error' || transactions.status === 'unavailable' || transactions.status === 'stale'
    ? ' resource-message--warning'
    : '';

  const exportJson = () => {
    if (rows.length === 0) return;
    const dataStr = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(rows, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `decant-transactions-${Date.now()}.json`);
    dlAnchor.click();
  };

  const exportCsv = () => {
    if (rows.length === 0) return;
    const header = 'txId,sessionId,model,promptTokens,completionTokens,costUnits,upstreamLatencyMs,timestamp,isoDateTime\n';
    const csvRows = rows.map((r) =>
      `"${r.txId}","${r.sessionId}","${r.model}",${r.promptTokens},${r.completionTokens},${r.costUnits},${r.upstreamLatencyMs},${r.timestamp},"${new Date(r.timestamp).toISOString()}"`
    ).join('\n');
    const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(header + csvRows);
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `decant-transactions-${Date.now()}.csv`);
    dlAnchor.click();
  };

  let emptyTitle = 'No transaction records returned';
  let emptyDescription = 'The gateway has not returned any credit transaction rows for this view.';
  if (transactions.status === 'loading' && rows.length === 0) {
    emptyTitle = 'Loading gateway records';
    emptyDescription = 'Waiting for the transaction snapshot to return.';
  } else if ((transactions.status === 'error' || transactions.status === 'unavailable') && rows.length === 0) {
    emptyTitle = 'Ledger unavailable';
    emptyDescription = 'The gateway transaction source is unavailable. This is not evidence that no transactions exist.';
  } else if (transactions.status === 'stale' && rows.length === 0) {
    emptyTitle = 'No current records available';
    emptyDescription = 'The latest transaction snapshot could not be refreshed.';
  } else if (rows.length > 0 && filteredRows.length === 0) {
    emptyTitle = 'No records match this search';
    emptyDescription = 'Try a transaction ID, session ID, or requested model from the returned snapshot.';
  }

  return (
    <section className="panel audit-panel" aria-labelledby="audit-heading" {...targetAttributes('credit-transaction-audit', 'panel')}>
      <div className="panel-heading audit-panel__heading">
        <div>
          <p className="eyebrow">GATEWAY LEDGER</p>
          <h2 id="audit-heading">Credit transaction audit</h2>
        </div>
        <div className="audit-panel__actions">
          <span className="source-badge">{scopeLabel}</span>
          {rows.length > 0 && (
            <>
              <button type="button" className="button button--quiet button--small" onClick={exportCsv} title="Download all returned transaction rows as CSV">Export CSV</button>
              <button type="button" className="button button--quiet button--small" onClick={exportJson} title="Download all returned transaction rows as JSON">Export JSON</button>
            </>
          )}
        </div>
      </div>

      {resourceMessage && <p className={`resource-message${messageTone}`} role={transactions.status === 'error' ? 'alert' : 'status'}>{resourceMessage}</p>}

      {rows.length > 0 && (
        <>
          <p className="panel-intro">Search returned rows by transaction, session, or requested model. Exports include all returned rows, not only the filtered view.</p>
          <div className="audit-controls" {...targetAttributes('transaction-audit-controls', 'panel')}>
            <label htmlFor="transaction-filter">Search returned transactions</label>
            <div className="audit-controls__search">
              <input
                id="transaction-filter"
                type="search"
                value={filter}
                onChange={(event) => { setFilter(event.target.value); setPage(0); }}
                placeholder="Transaction ID, session ID, or requested model"
                data-render-target="transaction-audit-filter"
                data-motion-trigger="interaction"
              />
              {filter && (
                <button type="button" className="button button--quiet button--small" onClick={() => { setFilter(''); setPage(0); }}>
                  Clear search
                </button>
              )}
            </div>
            <span className="audit-controls__count mono">{formatNumber(filteredRows.length)} matching / {formatNumber(rows.length)} returned</span>
          </div>
        </>
      )}

      {pageRows.length === 0 ? (
        <div className="empty-state" data-render-target="transaction-audit-empty-state" data-motion-trigger="status">
          <p className="empty-state__title">{emptyTitle}</p>
          <p className="empty-state__body">{emptyDescription}</p>
        </div>
      ) : (
        <>
          <div className="table-scroll" role="region" aria-label="Credit transactions; scroll horizontally on small screens" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">Gateway-returned credit transaction rows; cost units are not dollar amounts</caption>
              <thead>
                <tr>
                  <th scope="col">Transaction ID</th>
                  <th scope="col">Session ID</th>
                  <th scope="col">Requested model</th>
                  <th scope="col">Prompt tokens</th>
                  <th scope="col">Completion tokens</th>
                  <th scope="col">Cost units</th>
                  <th scope="col">Upstream latency</th>
                  <th scope="col">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((transaction) => (
                  <tr key={transaction.txId} {...targetAttributes('credit-transaction-row', 'list-item')}>
                    <td><code title={transaction.txId} aria-label={transaction.txId}>{shortIdentifier(transaction.txId, 8)}</code></td>
                    <td><code title={transaction.sessionId} aria-label={transaction.sessionId}>{shortIdentifier(transaction.sessionId, 7)}</code></td>
                    <td>{transaction.model}</td>
                    <td className="mono">{formatNumber(transaction.promptTokens)}</td>
                    <td className="mono">{formatNumber(transaction.completionTokens)}</td>
                    <td className="mono">{formatNumber(transaction.costUnits)}</td>
                    <td className="mono">{formatNumber(transaction.upstreamLatencyMs)} ms</td>
                    <td><time dateTime={new Date(transaction.timestamp).toISOString()}>{formatDateTime(transaction.timestamp)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="scope-note">Cost units and token counts are shown as returned by the gateway; this view does not derive charges. The requested-model field does not establish which provider produced a live streamed response.</p>
          <div className="audit-pagination" aria-label="Transaction table pagination" {...targetAttributes('transaction-audit-pagination', 'panel')}>
            <span className="mono">{formatNumber(firstRow)}–{formatNumber(lastRow)} of {formatNumber(filteredRows.length)}</span>
            <div className="action-row">
              <button type="button" className="button button--quiet button--small" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0} data-render-target="transaction-audit-previous" data-motion-trigger="interaction">Previous</button>
              <span className="mono">{formatNumber(currentPage + 1)} / {formatNumber(pageCount)}</span>
              <button type="button" className="button button--quiet button--small" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage >= pageCount - 1} data-render-target="transaction-audit-next" data-motion-trigger="interaction">Next</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
