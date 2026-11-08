import { useEffect, useState, type ReactNode } from 'react';
import { gatewayTargetLabel, setOperatorKey } from './api/client';
import { ActivityFeed } from './components/ActivityFeed';
import { DecantLogoMark } from './components/DecantLogo';
import { CentralMinimalistHero } from './components/CentralMinimalistHero';
import { ValueAccrualCard } from './components/ValueAccrualCard';
import { HowItWorksView } from './components/HowItWorksView';
import { HealthBar } from './components/HealthBar';
import { IntentBoard } from './components/IntentBoard';
import { SessionPanel } from './components/SessionPanel';
import { StreamViewer } from './components/StreamViewer';
import { ReservationReviewPanel } from './components/ReservationReviewPanel';
import { TransactionAudit } from './components/TransactionAudit';
import { AuthModal, type AuthState } from './components/AuthModal';
import { NearContractInspector } from './components/NearContractInspector';
import { ComputeShopView } from './components/ComputeShopView';
import { ProviderStudioView } from './components/ProviderStudioView';
import type { NearAccountInfo } from './api/near';
import type { DashboardSection } from './components/SidebarNav';

import { useDashboardData } from './hooks/useDashboardData';
import { targetAttributes } from './components/targets';

interface NavCategory {
  id: DashboardSection;
  label: string;
  icon: ReactNode;
}

const CATEGORY_HEADERS: Record<string, { headline: string; tagline: string }> = {
  overview: {
    headline: 'decentralized<br />intent gateway',
    tagline: 'Autonomous AI compute credit routing & settlement on NEAR.'
  },
  shop: {
    headline: 'compute<br />store',
    tagline: 'Browse verified AI models, select inference tiers, and fund compute sessions.'
  },
  request: {
    headline: 'live<br />inference',
    tagline: 'Stream tokens with real-time telemetry and atomic credit settlement.'
  },
  provider: {
    headline: 'solver<br />supply',
    tagline: 'Register compute nodes, stake capacity, and fulfill agent inference requests.'
  },
  identity: {
    headline: 'identity<br />ledger',
    tagline: 'Manage Ed25519 session keys, allocate credit quotas, and top up balances.'
  },
  accounting: {
    headline: 'settlement<br />audit',
    tagline: 'Persistent ledger records, solver proof-of-execution, and verifiable transactions.'
  },
  value: {
    headline: 'compute<br />value',
    tagline: 'Solver credit accrual and verifiable USDT redemption ledger.'
  },
  routing: {
    headline: 'intent<br />registry',
    tagline: 'Decentralized compute intents, solver bidding, and verified fulfillment commitments.'
  },
  guide: {
    headline: 'protocol<br />guide',
    tagline: 'Architecture breakdown, session security models, and NEAR contract integration.'
  },
  evidence: {
    headline: 'evidence<br />records',
    tagline: 'Cryptographic proof logs, validation claims, and state commitments.'
  }
};

export function App() {
  const dashboard = useDashboardData();

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authState, setAuthState] = useState<AuthState>({
    role: 'guest',
    nearAccount: null,
    operatorKey: '',
    agentSessionId: null,
  });

  const [now, setNow] = useState(() => Date.now());
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const queryTheme = params.get('theme');
      if (queryTheme === 'dark' || queryTheme === 'light') return queryTheme;
      const saved = localStorage.getItem('decant-theme');
      if (saved === 'dark' || saved === 'light') return saved;
      if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('decant-theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await dashboard.refresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleConnectNear = (account: NearAccountInfo) => {
    setAuthState((prev) => ({
      ...prev,
      role: 'near-wallet',
      nearAccount: account,
    }));
  };

  const handleConnectOperator = (key: string) => {
    setOperatorKey(key);
    setAuthState((prev) => ({
      ...prev,
      role: 'operator',
      operatorKey: key,
    }));
    void dashboard.refresh();
  };

  const handleConnectAgent = (sessionId: string) => {
    dashboard.selectSession(sessionId);
    setAuthState((prev) => ({
      ...prev,
      role: 'agent',
      agentSessionId: sessionId,
    }));
  };

  const handleDisconnect = () => {
    setOperatorKey('');
    setAuthState({
      role: 'guest',
      nearAccount: null,
      operatorKey: '',
      agentSessionId: null,
    });
    void dashboard.refresh();
  };

  const healthValue = dashboard.state.health.data?.status.toLowerCase();
  const hasHealthData = dashboard.state.health.data !== null;
  const gatewayTone = healthValue
    ? ['healthy', 'ok', 'operational'].includes(healthValue)
      ? 'healthy'
      : ['degraded', 'warning', 'partial'].includes(healthValue)
        ? 'warning'
        : ['offline', 'unhealthy', 'error'].includes(healthValue)
          ? 'offline'
          : 'unknown'
    : dashboard.state.health.status === 'loading'
      ? 'unknown'
      : 'offline';
  const healthLabel =
    dashboard.state.health.data?.status.toUpperCase() ??
    (dashboard.state.health.status === 'loading' ? 'CONNECTING' : 'OFFLINE');

  const categories: NavCategory[] = [
    {
      id: 'overview',
      label: 'overview',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      id: 'shop',
      label: 'store',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      ),
    },
    {
      id: 'request',
      label: 'inference',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      ),
    },
    {
      id: 'provider',
      label: 'supply',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      id: 'identity',
      label: 'sessions',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          <circle cx="12" cy="16" r="1.5" />
        </svg>
      ),
    },
    {
      id: 'accounting',
      label: 'ledger',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    {
      id: 'routing',
      label: 'routing',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
          <circle cx="18" cy="6" r="3" />
          <path d="M8.6 7.5L15.4 16.5" />
        </svg>
      ),
    },
    {
      id: 'guide',
      label: 'guide',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
  ];

  return (
    <div className="app-shell" data-theme={theme}>
      {/* ── Mobile Sidebar Drawer ── */}
      <div
        className={`mobile-drawer-backdrop ${isMobileNavOpen ? 'mobile-drawer-backdrop--open' : ''}`}
        onClick={() => setIsMobileNavOpen(false)}
        aria-hidden="true"
      />
      <aside
        id="mobile-drawer"
        className={`mobile-drawer ${isMobileNavOpen ? 'mobile-drawer--open' : ''}`}
        aria-label="Mobile Navigation"
      >
        <div className="mobile-drawer__header">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              <DecantLogoMark size={20} />
            </span>
            <span className="brand-name">DECANT</span>
            <span className="brand-descriptor">PROTOCOL</span>
          </div>
          <button
            type="button"
            className="mobile-drawer__close"
            onClick={() => setIsMobileNavOpen(false)}
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>
        <nav className="mobile-drawer__nav">
          {categories.map((cat) => {
            const isActive = activeSection === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                className={`mobile-drawer__item ${isActive ? 'mobile-drawer__item--active' : ''}`}
                onClick={() => {
                  setActiveSection(cat.id);
                  setIsMobileNavOpen(false);
                }}
              >
                <span className="mobile-drawer__icon">{cat.icon}</span>
                <span className="mobile-drawer__label">{cat.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="app-layout">
        <div className="app-content-wrapper">
          <header className="topbar">
            <div className="topbar__identity">
              <button
                type="button"
                className="mobile-menu-btn"
                onClick={() => setIsMobileNavOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={isMobileNavOpen}
                aria-controls="mobile-drawer"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              <a
                className="brand-lockup"
                href="#main-content"
                aria-label="DECANT operator console home"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveSection('overview');
                }}
                data-render-target="decant-wordmark"
                data-motion-trigger="none"
              >
                <span className="logo-word">decant</span>
              </a>
            </div>

            {/* ── Primary workspace navigation ── */}
            <nav className="topbar-nav" aria-label="Sections">
              {categories.map((cat) => {
                const isActive = activeSection === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`topbar-tab ${isActive ? 'topbar-tab--active' : ''}`}
                    onClick={() => setActiveSection(cat.id)}
                    aria-pressed={isActive}
                    title={cat.label}
                    data-render-target={`category-tab-${cat.id}`}
                  >
                    <span className={`topbar-tab__label ${isActive ? 'topbar-tab__label--active' : ''}`}>
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="topbar__meta">
              <span
                className={`connection-chip connection-chip--${gatewayTone}`}
                data-status={gatewayTone}
                data-render-target="gateway-connection-state"
                data-motion-trigger="status"
              >
                <span className={`status-indicator status-indicator--${gatewayTone}`} aria-hidden="true" />
                {healthLabel}
              </span>


              <button
                type="button"
                className="topbar-refresh-btn mono"
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Refresh gateway state"
              >
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>

              <button
                type="button"
                className="theme-toggle-btn"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>
          </header>

          <main id="main-content" className="app-main" {...targetAttributes('decant-main-content', 'none')}>
            {activeSection !== 'overview' && (
              <header className="category-hero-header">
                <h1
                  className="category-hero-header__title"
                  dangerouslySetInnerHTML={{ __html: CATEGORY_HEADERS[activeSection]?.headline || activeSection }}
                />
                <p className="category-hero-header__tagline">
                  {CATEGORY_HEADERS[activeSection]?.tagline}
                </p>
              </header>
            )}
            {/* ── Section 0: Compute Store (Wholesome Shopping Flow) ── */}
            {activeSection === 'shop' && (
              <div className="workspace-view" key="shop">
                <ComputeShopView
                  sessions={dashboard.state.sessions.data ?? []}
                  authState={authState}
                  onOrderCompleted={(sessionId, modelId) => {
                    dashboard.selectSession(sessionId);
                    setSelectedModel(modelId);
                  }}
                  onNavigateToPlayground={(sessionId, modelId) => {
                    dashboard.selectSession(sessionId);
                    setSelectedModel(modelId);
                    setActiveSection('request');
                  }}
                  onRefreshData={dashboard.refresh}
                  onRunTestPrompt={dashboard.runInference}
                />
              </div>
            )}

            {/* ── Provider Studio View ── */}
            {activeSection === 'provider' && (
              <div className="workspace-view" key="provider">
                <ProviderStudioView
                  onSuccessNotice={() => void dashboard.refresh()}
                />
              </div>
            )}

            {/* ── Section 1: Overview ── */}
            {activeSection === 'overview' && (
              <div className="workspace-view" key="overview">
                <CentralMinimalistHero
                  onNavigate={(section, model) => {
                    setActiveSection(section);
                    if (model) setSelectedModel(model);
                  }}
                />

                <HealthBar
                  resource={dashboard.state.health}
                  now={now}
                  apiTarget={gatewayTargetLabel()}
                  onRefresh={handleRefresh}
                />

                <NearContractInspector />

                <div className="overview-guide-prompt">
                  <div className="overview-guide-prompt__copy">
                    <span className="overview-guide-prompt__label">PROTOCOL GUIDE</span>
                    <span className="overview-guide-prompt__text">Architecture, settlement flow, and session security</span>
                  </div>
                  <button
                    type="button"
                    className="overview-guide-prompt__btn"
                    onClick={() => setActiveSection('guide')}
                  >
                    Explore architecture <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── Section 2: How It Works Guide ── */}
            {activeSection === 'guide' && (
              <HowItWorksView onNavigate={setActiveSection} />
            )}

            {/* ── Section 3: Compute-to-Value (USDT Redemption) ── */}
            {activeSection === 'value' && (
              <div className="workspace-view" key="value">
                <div className="workspace-header">
                  <div>
                    <div className="workspace-header__title">
                      <h2>Compute-to-Value Engine</h2>
                      <span className="source-badge">LOCAL CREDIT RECORDS</span>
                    </div>
                    <p className="workspace-header__desc">
                      View recorded solver credits. Verified rewards and USDT payouts are not connected yet.
                    </p>
                  </div>
                </div>
                <ValueAccrualCard onSuccess={() => void dashboard.refresh()} />
                <TransactionAudit transactions={dashboard.state.transactions} />
              </div>
            )}

            {/* ── Section 4: Identity & Credit ── */}
            {activeSection === 'identity' && (
              <div className="workspace-view" key="identity">
                <div className="workspace-header">
                  <div>
                    <div className="workspace-header__title">
                      <h2>Identity / credit</h2>
                      <span className="source-badge">SESSION LEDGER</span>
                    </div>
                    <p className="workspace-header__desc">
                      Ed25519 cryptographic public keys, compute-credit quota allocation, and active balance replenishment.
                    </p>
                  </div>
                </div>

                <div className="workspace-view--split">
                  <SessionPanel
                    sessions={dashboard.state.sessions}
                    sessionDetail={dashboard.state.sessionDetail}
                    selectedSessionId={dashboard.state.selectedSessionId}
                    trackedSessionIds={dashboard.state.trackedSessionIds}
                    onSelect={dashboard.selectSession}
                    onTrack={dashboard.trackSession}
                    onUntrack={dashboard.untrackSession}
                    onRegister={dashboard.registerSession}
                    onTopUp={dashboard.topUpSession}
                    onSuspend={dashboard.suspendSession}
                    onResume={dashboard.resumeSession}
                  />
                  <TransactionAudit transactions={dashboard.state.transactions} />
                </div>
              </div>
            )}

            {/* ── Section 5: Session-Scoped Request (Inference Stream) ── */}
            {activeSection === 'request' && (
              <div className="workspace-view" key="request">
                <div className="workspace-header">
                  <div>
                    <div className="workspace-header__title">
                      <h2>AI Inference Playground</h2>
                      <span className="source-badge">LIVE STREAMING</span>
                    </div>
                    <p className="workspace-header__desc">
                      Select your preferred Gemini or DePIN model, adjust output parameters, and stream live tokens with atomic credit settlement.
                    </p>
                  </div>
                </div>

                <div className="workspace-view--split">
                  <SessionPanel
                    sessions={dashboard.state.sessions}
                    sessionDetail={dashboard.state.sessionDetail}
                    selectedSessionId={dashboard.state.selectedSessionId}
                    trackedSessionIds={dashboard.state.trackedSessionIds}
                    onSelect={dashboard.selectSession}
                    onTrack={dashboard.trackSession}
                    onUntrack={dashboard.untrackSession}
                    onRegister={dashboard.registerSession}
                    onTopUp={dashboard.topUpSession}
                    onSuspend={dashboard.suspendSession}
                    onResume={dashboard.resumeSession}
                  />
                  <StreamViewer
                    sessions={dashboard.state.sessions}
                    selectedSessionId={dashboard.state.selectedSessionId}
                    stream={dashboard.state.stream}
                    now={now}
                    initialModel={selectedModel}
                    models={dashboard.state.health.data?.models}
                    onSelectSession={dashboard.selectSession}
                    onRun={dashboard.runInference}
                  />
                </div>
              </div>
            )}

            {/* ── Section 6: Routing & Settlement (Intent Board) ── */}
            {activeSection === 'routing' && (
              <div className="workspace-view" key="routing">
                <div className="workspace-header">
                  <div>
                    <div className="workspace-header__title">
                      <h2>Routing / settlement</h2>
                      <span className="source-badge">INTENT REGISTRY</span>
                    </div>
                    <p className="workspace-header__desc">
                      Decentralized compute intents: broadcast agent requirements, match with DePIN solver nodes, and verify fulfillment commitments.
                    </p>
                  </div>
                </div>

                <NearContractInspector />

                <div className="workspace-view--single">
                  <IntentBoard
                    intents={dashboard.state.intents}
                    confirmedIntents={dashboard.state.consoleIntents}
                    sessions={dashboard.state.sessions}
                    selectedSessionId={dashboard.state.selectedSessionId}
                    onBroadcast={dashboard.broadcastIntent}
                    onFill={dashboard.fillIntent}
                  />
                </div>
              </div>
            )}

            {/* ── Section 7: Accounting & Reconciliation (Transaction Audit) ── */}
            {activeSection === 'accounting' && (
              <div className="workspace-view" key="accounting">
                <div className="workspace-header">
                  <div>
                    <div className="workspace-header__title">
                      <h2>Accounting / reconciliation</h2>
                      <span className="source-badge">SQLITE ACID LEDGER</span>
                    </div>
                    <p className="workspace-header__desc">
                      Gateway records of estimated input/output credit units, provider latency, and credit use.
                    </p>
                  </div>
                </div>

                <div className="workspace-view--single">
                  <TransactionAudit transactions={dashboard.state.transactions} />
                  <ReservationReviewPanel onReviewed={() => void dashboard.refresh()} />
                </div>
              </div>
            )}

            {/* ── Section 8: Observed Evidence (Telemetry & Gateway Logs) ── */}
            {activeSection === 'evidence' && (
              <div className="workspace-view" key="evidence">
                <div className="workspace-header">
                  <div>
                    <div className="workspace-header__title">
                      <h2>Observed evidence</h2>
                      <span className="source-badge">GATEWAY TELEMETRY</span>
                    </div>
                    <p className="workspace-header__desc">
                      Directly observed gateway status codes, anti-tamper verifications, and security policy checks.
                    </p>
                  </div>
                </div>

                <HealthBar
                  resource={dashboard.state.health}
                  now={now}
                  apiTarget={gatewayTargetLabel()}
                  onRefresh={handleRefresh}
                />

                <div className="workspace-view--split">
                  <ActivityFeed transactions={dashboard.state.transactions} events={dashboard.state.observedEvents} />
                  <TransactionAudit transactions={dashboard.state.transactions} />
                </div>
              </div>
            )}
          </main>

          <footer className="app-footer" {...targetAttributes('decant-observability-boundary', 'status')}>
            <span>DECANT / OPERATIONS</span>
            <span>Gateway records, live NEAR smart contract & real-time Gemini streaming</span>
            <span className="mono">
              {hasHealthData
                ? dashboard.state.health.status === 'stale'
                  ? 'SOURCE: LAST KNOWN · STALE'
                  : 'SOURCE: API RESPONDED'
                : 'SOURCE: WAITING FOR API'}
            </span>
          </footer>
        </div>
      </div>

      {/* ── Auth & Identity Modal ── */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        authState={authState}
        onConnectNear={handleConnectNear}
        onConnectOperator={handleConnectOperator}
        onConnectAgent={handleConnectAgent}
        onDisconnect={handleDisconnect}
        sessions={dashboard.state.sessions.data ?? []}
      />
    </div>
  );
}
