import { useState } from 'react';
import { errorMessage } from '../api/client';
import { fetchNearAccount, type NearAccountInfo } from '../api/near';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOperator: boolean;
  onConnectOperator: (key: string) => Promise<void>;
  onDisconnect: () => void;
}

export function AuthModal({
  isOpen,
  onClose,
  isOperator,
  onConnectOperator,
  onDisconnect,
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'near' | 'operator'>('operator');
  const [nearInput, setNearInput] = useState('');
  const [nearLoading, setNearLoading] = useState(false);
  const [nearError, setNearError] = useState<string | null>(null);

  const [operatorInput, setOperatorInput] = useState('');
  const [operatorError, setOperatorError] = useState('');
  const [operatorPending, setOperatorPending] = useState(false);
  const [nearAccount, setNearAccount] = useState<NearAccountInfo | null>(null);

  if (!isOpen) return null;

  async function handleNearConnect() {
    const target = nearInput.trim();
    if (!target) return;
    setNearLoading(true);
    setNearError(null);
    setNearAccount(null);
    try {
      const accountInfo = await fetchNearAccount(target);
      setNearAccount(accountInfo);
      setNearInput('');
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
              {isOperator ? (
                <span className="identity-pill identity-pill--operator">Operator access verified</span>
              ) : (
                <span className="identity-pill identity-pill--guest">Guest / Read-Only Mode</span>
              )}
            </div>
          </div>
          {isOperator && (
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
        </div>

        {/* Tab 1: NEAR Web3 Account */}
        {activeTab === 'near' && (
          <div className="auth-tab-content">
            <p className="tab-desc">
              Look up a public account balance on NEAR Testnet. This does not grant operator access.
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
                  placeholder="Enter a testnet account ID"
                  value={nearInput}
                  onChange={(e) => setNearInput(e.target.value)}
                  disabled={nearLoading}
                />
                <button type="submit" className="button button--primary" disabled={nearLoading || !nearInput.trim()}>
                  {nearLoading ? 'Looking up…' : 'Look up account'}
                </button>
              </div>
            </form>

            {nearError && <p className="inline-error">{nearError}</p>}

            {nearAccount && (
              <div className="account-card">
                <div className="account-card__row">
                  <span className="metric-label">Account</span>
                  <span className="mono font-bold">{nearAccount.accountId}</span>
                </div>
                <div className="account-card__row">
                  <span className="metric-label">Testnet Balance</span>
                  <span className="mono green-text">{nearAccount.nearBalance} NEAR</span>
                </div>
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

      </div>
    </div>
  );
}
