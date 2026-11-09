import { useEffect, useState } from 'react';
import { DEFAULT_CONTRACT_ID, DEFAULT_NEAR_RPC, fetchContractQuota, fetchNearAccount, type NearAccountInfo, type NearContractQuota } from '../api/near';

export function NearContractInspector() {
  const [contractInfo, setContractInfo] = useState<NearAccountInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [querySessionId, setQuerySessionId] = useState('');
  const [quotaResult, setQuotaResult] = useState<NearContractQuota | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadContractInfo();
  }, []);

  async function loadContractInfo() {
    if (!DEFAULT_CONTRACT_ID) return;
    setLoading(true);
    setError(null);
    try {
      const info = await fetchNearAccount(DEFAULT_CONTRACT_ID);
      setContractInfo(info);
    } catch (err) {
      setContractInfo(null);
      setError(err instanceof Error ? err.message : 'Could not reach FastNEAR RPC');
    } finally {
      setLoading(false);
    }
  }

  async function queryQuota() {
    const id = querySessionId.trim();
    if (!id) return;
    setQueryLoading(true);
    setQuotaResult(null);
    setError(null);
    try {
      const quota = await fetchContractQuota(id);
      setQuotaResult(quota);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not read contract quota.");
    } finally {
      setQueryLoading(false);
    }
  }

  if (!DEFAULT_CONTRACT_ID) {
    return <section className="panel near-contract-panel">
      <h2>NEAR Testnet</h2>
      <p className="field-note">Set a testnet contract ID to enable quota lookups.</p>
    </section>;
  }

  return (
    <section className="panel near-contract-panel" aria-label="NEAR Smart Contract Explorer">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Read-only contract lookup</p>
          <h2>NEAR Testnet Smart Contract</h2>
        </div>
        <div className="panel-heading__actions">
          <button
            type="button"
            className="button button--quiet btn-sm"
            onClick={() => void loadContractInfo()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh State'}
          </button>
        </div>
      </div>

      <div className="contract-overview-grid">
        <div className="contract-stat-card">
          <span className="metric-label">Contract Account</span>
          <a
            href={`https://testnet.nearblocks.io/address/${DEFAULT_CONTRACT_ID}`}
            target="_blank"
            rel="noreferrer"
            className="link-highlight mono font-bold"
            title="View on NearBlocks Explorer"
          >
            {DEFAULT_CONTRACT_ID} ↗
          </a>
        </div>

        <div className="contract-stat-card">
          <span className="metric-label">Account balance</span>
          <strong className="mono green-text">{contractInfo ? `${contractInfo.nearBalance} NEAR` : '—'}</strong>
        </div>

        <div className="contract-stat-card">
          <span className="metric-label">Network RPC</span>
          <span className="mono" title={DEFAULT_NEAR_RPC}>FastNEAR (testnet)</span>
        </div>

        <div className="contract-stat-card">
          <span className="metric-label">Block Height</span>
          <span className="mono">{contractInfo ? `#${contractInfo.blockHeight.toLocaleString()}` : '—'}</span>
        </div>
      </div>

      {error && <p className="inline-error">{error}</p>}

      {/* Live Quota RPC Query Form */}
      <div className="quota-query-box">
        <div className="quota-query-header">
          <div>
            <h4 style={{ margin: 0 }}>On-Chain Quota Inspector</h4>
            <p className="field-note" style={{ margin: '4px 0 0' }}>
              Directly queries the deployed smart contract's <code className="mono">get_quota</code> view method via FastNEAR RPC.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void queryQuota();
          }}
          className="quota-query-form"
        >
          <div className="input-with-action">
            <input
              type="text"
              placeholder="Enter session ID"
              value={querySessionId}
              onChange={(e) => setQuerySessionId(e.target.value)}
              className="mono"
            />
            <button type="submit" className="button button--primary" disabled={queryLoading || !querySessionId.trim()}>
              {queryLoading ? 'Querying…' : 'Query Contract'}
            </button>
          </div>
        </form>

        {quotaResult ? (
          <div className="quota-result-card">
            <div className="quota-result-grid">
              <div>
                <span className="metric-label">Session ID</span>
                <span className="mono font-bold">{quotaResult.sessionId}</span>
              </div>
              <div>
                <span className="metric-label">Owner Account</span>
                <span className="mono">{quotaResult.owner}</span>
              </div>
              <div>
                <span className="metric-label">Remaining Quota</span>
                <span className="mono green-text font-bold">{quotaResult.remaining.toLocaleString()} units</span>
              </div>
              <div>
                <span className="metric-label">Total Allocated</span>
                <span className="mono">{quotaResult.total.toLocaleString()} units</span>
              </div>
            </div>
          </div>
        ) : (
          querySessionId && !queryLoading && (
            <p className="field-note" style={{ marginTop: '10px' }}>
              No on-chain quota found for session <code className="mono">{querySessionId}</code> on this contract.
            </p>
          )
        )}
      </div>
    </section>
  );
}
