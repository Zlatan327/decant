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
    ? 'GLOBAL AUDIT'
    : transactions.scope === 'per-session'
      ? 'SCOPED AUDIT'
      : 'AUDIT UNAVAILABLE';
  const resourceMessage = transactions.message;
  const messageTone = transactions.status === 'error' || transactions.status === 'unavailable' || transactions.status === 'stale'
    ? ' resource-message--warning'
    : '';

  return (
    <section className="panel audit-panel" aria-labelledby="audit-heading" {...targetAttributes('credit-transaction-audit', 'panel')}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Accounting / reconciliation</p>
          <h2 id="audit-heading">Credit transaction audit</h2>
        </div>
        <span className="source-badge">{scopeLabel}</span>
      </div>
      {resourceMessage && <p className={`resource-message${messageTone}`} role={transactions.status === 'error' ? 'alert' : 'status'}>{resourceMessage}</p>}
      {rows.length > 0 && <p className="scope-note">Model is the value recorded by the gateway for the request; provider fallback is verified from the live SSE response, not inferred from this ledger field.</p>}
      {rows.length > 0 && (
        <div className="audit-controls" {...targetAttributes('transaction-audit-controls', 'panel')}>
          <label htmlFor="transaction-filter">Filter the current API snapshot</label>
          <input
            id="transaction-filter"
            type="search"
            value={filter}
            onChange={(event) => { setFilter(event.target.value); setPage(0); }}
            placeholder="Transaction, session, or model"
            data-render-target="transaction-audit-filter"
            data-motion-trigger="interaction"
          />
          <span className="audit-controls__count mono">{formatNumber(filteredRows.length)} matching / {formatNumber(rows.length)} returned</span>
        </div>
      )}
      {pageRows.length === 0 ? (
        <div className="empty-state" data-render-target="transaction-audit-empty-state" data-motion-trigger="status">
          <p className="empty-state__title">{rows.length > 0 ? 'No records match this filter' : 'No transaction records returned'}</p>
          <p className="empty-state__body">This table shows gateway ledger entries only. It does not derive charges from prompts or fabricate reconciliation records.</p>
        </div>
      ) : (
        <>
          <div className="table-scroll" role="region" aria-label="Credit transactions; scroll horizontally on small screens" tabIndex={0}>
            <table className="data-table">
              <caption className="sr-only">Gateway credit transaction audit entries</caption>
              <thead>
                <tr>
                  <th scope="col">Transaction</th>
                  <th scope="col">Session</th>
                  <th scope="col">Requested model</th>
                  <th scope="col">Prompt</th>
                  <th scope="col">Completion</th>
                  <th scope="col">Cost units</th>
                  <th scope="col">Upstream</th>
                  <th scope="col">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((transaction) => (
                  <tr key={transaction.txId} {...targetAttributes('credit-transaction-row', 'list-item')}>
                    <td><code title={transaction.txId}>{shortIdentifier(transaction.txId, 8)}</code></td>
                    <td><code title={transaction.sessionId}>{shortIdentifier(transaction.sessionId, 7)}</code></td>
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
