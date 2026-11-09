import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { fetchContractQuota, fetchNearAccount, type NearAccountInfo, type NearContractQuota } from '../api/near';
import { generateAgentKeypair, type GeneratedKeypair } from '../domain/crypto';
import type { SessionRecord } from '../domain/types';

export type AuthRole = 'guest' | 'near-wallet' | 'operator' | 'agent';

export interface AuthState {
  role: AuthRole;
  nearAccount: NearAccountInfo | null;
  operatorKey: string;
  agentSessionId: string | null;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  authState: AuthState;
  onConnectNear: (account: NearAccountInfo) => void;
  onConnectOperator: (key: string) => Promise<void>;
  onConnectAgent: (sessionId: string) => void;
  onDisconnect: () => void;
  sessions: SessionRecord[];
}

const DEV_NEAR_ACCOUNT = 'shylibrary4027.testnet';

export function AuthModal({
  isOpen,
  onClose,
  authState,
  onConnectNear,
  onConnectOperator,
  onConnectAgent,
  onDisconnect,
  sessions,
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'near' | 'operator' | 'agent'>('operator');
  const [nearInput, setNearInput] = useState('');
  const [nearLoading, setNearLoading] = useState(false);
  const [nearError, setNearError] = useState<string | null>(null);
  const [contractQuota, setContractQuota] = useState<NearContractQuota | null>(null);

  const [operatorInput, setOperatorInput] = useState('');
  const [operatorError, setOperatorError] = useState('');
  const [operatorPending, setOperatorPending] = useState(false);
  const [agentInput, setAgentInput] = useState('');
  const [generatedKey, setGeneratedKey] = useState<GeneratedKeypair | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  useEffect(() => {
    if (authState.nearAccount) {
      void fetchContractQuota('agent-production-01').then((quota) => setContractQuota(quota));
    }
  }, [authState.nearAccount]);

  if (!isOpen) return null;

  async function handleNearConnect(accountIdToUse?: string) {
    const target = (accountIdToUse || nearInput).trim();
    if (!target) return;
    setNearLoading(true);
    setNearError(null);
    try {
      const accountInfo = await fetchNearAccount(target);
      onConnectNear(accountInfo);
      setNearInput('');
      const quota = await fetchContractQuota('agent-production-01');
      setContractQuota(quota);
    } catch (err) {
      setNearError(err instanceof Error ? err.message : 'Failed to query account on NEAR Testnet');
    } finally {
      setNearLoading(false);
    }
  }

  async function handleOperatorConnect() {
    const key = operatorInput.trim();
    if (!key || operatorPending) return;
    setOperatorPending(true);
    setOperatorError('');
    try {
      await onConnectOperator(key);
      setOperatorInput('');
      onClose();
    } catch (failure) {
      setOperatorError(errorMessage(failure));
    } finally {
      setOperatorPending(false);
    }
  }

  function handleAgentConnect(sessionIdToUse?: string) {
    const session = (sessionIdToUse || agentInput).trim();
    if (!session) return;
    onConnectAgent(session);
    setAgentInput('');
    onClose();
  }

  async function handleGenerateKeypair() {
    const keypair = await generateAgentKeypair();
    setGeneratedKey(keypair);
  }

  function copyText(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setCopyNotice(label);
    setTimeout(() => setCopyNotice(null), 2500);
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-panel auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Identity & Access Management</span>
            <h2>Sign In / Connect</h2>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        {/* Current Connection Status Banner */}
        <div className="auth-status-banner">
          <div className="auth-status-banner__info">
            <span className="metric-label">Active Identity</span>
            <div className="auth-status-banner__role">
              {authState.role === 'near-wallet' && (
                <span className="identity-pill identity-pill--near">
                  {authState.nearAccount?.accountId} · {authState.nearAccount?.nearBalance} NEAR
                </span>
              )}
              {authState.role === 'operator' && (
                <span className="identity-pill identity-pill--operator">
                  Operator access verified
                </span>
              )}
              {authState.role === 'agent' && (
                <span className="identity-pill identity-pill--agent">
                  Agent Session: {authState.agentSessionId}
                </span>
              )}
              {authState.role === 'guest' && (
                <span className="identity-pill identity-pill--guest">
                  Guest / Read-Only Mode
                </span>
              )}
            </div>
          </div>
          {authState.role !== 'guest' && (
            <button type="button" className="button button--quiet disconnect-btn" onClick={onDisconnect}>
              Disconnect
            </button>
          )}
        </div>

        {/* Tab Switcher */}
        <div className="auth-tab-bar">
          <button
            type="button"
            className={`auth-tab ${activeTab === 'near' ? 'auth-tab--active' : ''}`}
            onClick={() => setActiveTab('near')}
          >
             NEAR Account Lookup
          </button>
          <button
            type="button"
            className={`auth-tab ${activeTab === 'operator' ? 'auth-tab--active' : ''}`}
            onClick={() => setActiveTab('operator')}
          >
             Operator Admin
          </button>
          <button
            type="button"
            className={`auth-tab ${activeTab === 'agent' ? 'auth-tab--active' : ''}`}
            onClick={() => setActiveTab('agent')}
          >
             Agent Keypair
          </button>
        </div>

        {/* Tab 1: NEAR Web3 Account */}
        {activeTab === 'near' && (
          <div className="auth-tab-content">
            <p className="tab-desc">
              Connect your NEAR Testnet account to inspect on-chain quota staking, verify smart contract balances, and broadcast compute settlement intents.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleNearConnect();
              }}
              className="auth-form"
            >
              <label htmlFor="near-account-input">NEAR Testnet Account ID</label>
              <div className="input-with-action">
                <input
                  id="near-account-input"
                  type="text"
                  placeholder="e.g. shylibrary4027.testnet"
                  value={nearInput}
                  onChange={(e) => setNearInput(e.target.value)}
                  disabled={nearLoading}
                />
                <button type="submit" className="button button--primary" disabled={nearLoading || !nearInput.trim()}>
                  {nearLoading ? 'Probing RPC…' : 'Connect'}
                </button>
              </div>
            </form>

            <div className="quick-connect-row">
              <span className="quick-connect-label">Testnet Shortcut:</span>
              <button
                type="button"
                className="pill-btn pill-btn--highlight"
                onClick={() => void handleNearConnect(DEV_NEAR_ACCOUNT)}
                disabled={nearLoading}
              >
                Connect {DEV_NEAR_ACCOUNT} (Deployed Contract)
              </button>
            </div>

            {nearError && <p className="inline-error">{nearError}</p>}

            {authState.nearAccount && (
              <div className="account-card">
                <div className="account-card__row">
                  <span className="metric-label">Account</span>
                  <span className="mono font-bold">{authState.nearAccount.accountId}</span>
                </div>
                <div className="account-card__row">
                  <span className="metric-label">Testnet Balance</span>
                  <span className="mono green-text">{authState.nearAccount.nearBalance} NEAR</span>
                </div>
                <div className="account-card__row">
                  <span className="metric-label">Smart Contract</span>
                  <a
                    href={`https://testnet.nearblocks.io/address/${DEFAULT_CONTRACT_ID}`}
                    target="_blank"
                    rel="noreferrer"
                    className="link-highlight mono"
                  >
                    shylibrary4027.testnet ↗
                  </a>
                </div>
                {contractQuota && (
                  <div className="account-card__row">
                    <span className="metric-label">On-Chain Quota</span>
                    <span className="mono">{contractQuota.remaining} / {contractQuota.total} units</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Operator Admin */}
        {activeTab === 'operator' && (
          <div className="auth-tab-content">
            <p className="tab-desc">
              Enter the operator key to register sessions, add credits, and review the ledger.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleOperatorConnect();
              }}
              className="auth-form"
            >
              <label htmlFor="operator-key-modal">Operator key</label>
              <div className="input-with-action">
                <input
                  id="operator-key-modal"
                  type="password"
                  placeholder="Enter DECANT_ADMIN_KEY…"
                  value={operatorInput}
                  onChange={(e) => setOperatorInput(e.target.value)}
                />
                <button type="submit" className="button button--primary" disabled={!operatorInput.trim() || operatorPending}>
                  {operatorPending ? 'Checking…' : 'Authenticate'}
                </button>
              </div>
            </form>

            {operatorError && <p className="inline-error" role="alert">{operatorError}</p>}
            <p className="field-note">
              Your key is kept in memory and sent to the configured gateway to authorize requests.
            </p>
          </div>
        )}

        {/* Tab 3: Agent Keypair */}
        {activeTab === 'agent' && (
          <div className="auth-tab-content">
            <p className="tab-desc">
              Connect or generate an autonomous agent session keypair. Agents use Ed25519 signatures to authenticate programmatic compute requests.
            </p>

            <div className="agent-quick-select">
              <label htmlFor="agent-session-select">Select Active Session</label>
              <div className="input-with-action">
                <select
                  id="agent-session-select"
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                >
                  <option value="">Select a registered agent session…</option>
                  {sessions.map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {s.sessionId} ({s.remainingQuota} credits)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => handleAgentConnect()}
                  disabled={!agentInput}
                >
                  Select
                </button>
              </div>
            </div>

            <div className="keygen-section">
              <div className="keygen-header">
                <div>
                  <h4>Browser Ed25519 Key Generator</h4>
                  <p className="field-note">Generate cryptographic credentials for your autonomous bot SDK</p>
                </div>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => void handleGenerateKeypair()}
                >
                  Generate New Keypair
                </button>
              </div>

              {generatedKey && (
                <div className="keygen-result">
                  <div className="keygen-field">
                    <span className="metric-label">Session ID:</span>
                    <code className="mono">{generatedKey.sessionId}</code>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() => copyText(generatedKey.sessionId, 'Session ID copied')}
                    >
                      Copy
                    </button>
                  </div>
                  <div className="keygen-field">
                    <span className="metric-label">Public Key:</span>
                    <code className="mono">{generatedKey.publicKey}</code>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() => copyText(generatedKey.publicKey, 'Public key copied')}
                    >
                      Copy
                    </button>
                  </div>
                  <div className="keygen-field">
                    <span className="metric-label">Private Key:</span>
                    <code className="mono">{generatedKey.privateKey}</code>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() => copyText(generatedKey.privateKey, 'Private key copied')}
                    >
                      Copy
                    </button>
                  </div>
                  <div className="code-snippet-box">
                    <div className="code-snippet-header">
                      <span>Node.js / TypeScript SDK Setup</span>
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() => copyText(generatedKey.sdkSnippet, 'SDK snippet copied')}
                      >
                        Copy Snippet
                      </button>
                    </div>
                    <pre className="mono code-snippet">{generatedKey.sdkSnippet}</pre>
                  </div>
                </div>
              )}

              {copyNotice && <div className="copy-toast">{copyNotice}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const DEFAULT_CONTRACT_ID = 'shylibrary4027.testnet';
