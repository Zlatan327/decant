import { useEffect, useState, type ReactNode } from 'react';
import { gatewayTargetLabel, requestJson, setOperatorKey } from './api/client';
import { ActivityFeed } from './components/ActivityFeed';
import { DecantLogoMark } from './components/DecantLogo';
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

const CATEGORY_HEADERS: Partial<Record<DashboardSection, { headline: string; tagline: string }>> = {
  overview: { headline: 'Decant', tagline: 'Run AI requests and track compute credits.' },
  request: { headline: 'Run inference', tagline: 'Send a request and see how many credits it uses.' },
  provider: { headline: 'Providers', tagline: 'View and manage registered providers.' },
  identity: { headline: 'Sessions', tagline: 'Register agent keys and allocate local credits.' },
  accounting: { headline: 'Ledger', tagline: 'Review credit usage and held credits.' },
  value: { headline: 'Solver credits', tagline: 'View local solver credit records.' },
  routing: { headline: 'Routing', tagline: 'Review compute intents and inspect the NEAR testnet contract.' },
  guide: { headline: 'Guide', tagline: 'Get started with the gateway.' },
  evidence: { headline: 'Activity', tagline: 'Review requests observed by the gateway.' },
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
  const [activeSection, selectSection] = useState<DashboardSection>('overview');
  const setActiveSection = (section: DashboardSection) => {
    selectSection(section === 'shop' ? 'identity' : section);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

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
    setOperatorKey('');
    setAuthState((prev) => ({
      ...prev,
      role: 'near-wallet',
      operatorKey: '',
      nearAccount: account,
    }));
    void dashboard.refresh();
  };

  const handleConnectOperator = async (key: string) => {
    await requestJson('/v1/sessions', { headers: { 'X-Decant-Admin-Key': key } });
    setOperatorKey(key);
    setAuthState((prev) => ({
      ...prev,
      role: 'operator',
      operatorKey: key,
    }));
    void dashboard.refresh();
  };

  const handleConnectAgent = (sessionId: string) => {
    setOperatorKey('');
    dashboard.selectSession(sessionId);
    setAuthState((prev) => ({
      ...prev,
      role: 'agent',
      operatorKey: '',
      agentSessionId: sessionId,
    }));
    void dashboard.refresh();
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
      label: 'Overview',
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
      id: 'request',
      label: 'Inference',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      ),
    },
    {
      id: 'provider',
      label: 'Providers',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      id: 'identity',
      label: 'Sessions',
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
      label: 'Ledger',
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    {
      id: 'routing',
      label: 'Routing',
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
      label: 'Guide',
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
    <div className="app-shell decant-console">
      {/* ── Mobile Sidebar Drawer ── */}
      <div
        className={`mobile-drawer-backdrop ${isMobileNavOpen ? 'mobile-drawer-backdrop--open' : ''}`}
        onClick={() => setIsMobileNavOpen(false)}
        aria-hidden="true"
      />
      <aside
        id="mobile-drawer"
        className={`mobile-drawer ${isMobileNavOpen ? 'mobile-drawer--open' : ''}`}
        aria-label="Workspace navigation"
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
        <nav className="mobile-drawer__nav" aria-label="Workspace sections">
          {categories.map((cat) => {
            const isActive = activeSection === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                className={`mobile-drawer__item ${isActive ? 'mobile-drawer__item--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
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

            <span className="workspace-location">Workspace / {categories.find(category => category.id === activeSection)?.label ?? CATEGORY_HEADERS[activeSection]?.headline}</span>
            <div className="topbar__meta">
              <button type="button" className="button button--quiet operator-access" onClick={() => setIsAuthModalOpen(true)}>
                {authState.role === 'operator' ? 'Operator settings' : 'Operator access'}
              </button>
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

            </div>
          </header>

          <main id="main-content" className="app-main" {...targetAttributes('decant-main-content', 'none')}>
            <header className="console-page-heading">
              <h1>{CATEGORY_HEADERS[activeSection]?.headline}</h1>
              <p>{CATEGORY_HEADERS[activeSection]?.tagline}</p>
              {activeSection === 'overview' && (
                <button type="button" className="button button--primary" onClick={() => setActiveSection('request')}>Run inference</button>
              )}
            </header>

            {/* ── Provider Studio View ── */}
            {activeSection === 'provider' && (
              <div className="workspace-view" key="provider">
                <ProviderStudioView
                  canManage={authState.role === 'operator'}
                  onSuccessNotice={() => void dashboard.refresh()}
                />
              </div>
            )}

            {/* ── Section 1: Overview ── */}
            {activeSection === 'overview' && (
              <div className="workspace-view" key="overview">
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
                <ValueAccrualCard onSuccess={() => void dashboard.refresh()} />
                <TransactionAudit transactions={dashboard.state.transactions} />
              </div>
            )}

            {/* ── Section 4: Identity & Credit ── */}
            {activeSection === 'identity' && (
              <div className="workspace-view" key="identity">

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
                <StreamViewer
                  sessions={dashboard.state.sessions}
                  selectedSessionId={dashboard.state.selectedSessionId}
                  stream={dashboard.state.stream}
                  now={now}
                  models={dashboard.state.health.data?.inferenceConfigured ? dashboard.state.health.data.models : []}
                  onSelectSession={dashboard.selectSession}
                  onRun={dashboard.runInference}
                  onManageSessions={() => setActiveSection('identity')}
                />
                <TransactionAudit transactions={dashboard.state.transactions} title="Recent requests" />
              </div>
            )}

            {/* ── Section 6: Routing & Settlement (Intent Board) ── */}
            {activeSection === 'routing' && (
              <div className="workspace-view" key="routing">

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

                <div className="workspace-view--single">
                  <TransactionAudit transactions={dashboard.state.transactions} />
                  {authState.role === 'operator' ? (
                    <ReservationReviewPanel onReviewed={() => void dashboard.refresh()} />
                  ) : (
                    <section className="panel ledger-access">
                      <h2>Held credits</h2>
                      <p>Sign in as an operator to review credits held for unfinished requests.</p>
                      <button type="button" className="button button--secondary" onClick={() => setIsAuthModalOpen(true)}>
                        Operator sign-in
                      </button>
                    </section>
                  )}
                </div>
              </div>
            )}

            {/* ── Section 8: Observed Evidence (Telemetry & Gateway Logs) ── */}
            {activeSection === 'evidence' && (
              <div className="workspace-view" key="evidence">

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
            <span>Gateway records and NEAR testnet reads</span>
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
