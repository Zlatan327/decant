import { useEffect, useState, type ReactNode } from 'react';
import { gatewayTargetLabel } from './api/client';
import { ActivityFeed } from './components/ActivityFeed';
import { DecantLogoMark } from './components/DecantLogo';
import { CentralMinimalistHero } from './components/CentralMinimalistHero';
import { ValueAccrualCard } from './components/ValueAccrualCard';
import { HowItWorksView } from './components/HowItWorksView';
import { HealthBar } from './components/HealthBar';
import { IntentBoard } from './components/IntentBoard';
import { SessionPanel } from './components/SessionPanel';
import { StreamViewer } from './components/StreamViewer';
import { TransactionAudit } from './components/TransactionAudit';
import type { DashboardSection } from './components/SidebarNav';
import { formatDateTime } from './domain/format';
import { useDashboardData } from './hooks/useDashboardData';
import { targetAttributes } from './components/targets';

interface NavCategory {
  id: DashboardSection;
  label: string;
  icon: ReactNode;
}

export function App() {
  const dashboard = useDashboardData();
  const [now, setNow] = useState(() => Date.now());
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);

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
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      id: 'guide',
      label: 'Protocol',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    {
      id: 'value',
      label: 'Value',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 6v12M15 9.5H10a2.5 2.5 0 0 0 0 5H14a2.5 2.5 0 0 1 0 5H9" />
        </svg>
      ),
    },
    {
      id: 'identity',
      label: 'Sessions',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          <circle cx="12" cy="16" r="1.5" />
        </svg>
      ),
    },
    {
      id: 'request',
      label: 'Inference',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      ),
    },
    {
      id: 'routing',
      label: 'Routing',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="18" r="3" />
          <circle cx="18" cy="6" r="3" />
          <path d="M8.6 7.5L15.4 16.5" />
          <path d="M9 6h6" />
        </svg>
      ),
    },
    {
      id: 'accounting',
      label: 'Ledger',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <line x1="9" y1="7" x2="15" y2="7" />
          <line x1="9" y1="11" x2="15" y2="11" />
        </svg>
      ),
    },
    {
      id: 'evidence',
      label: 'Activity',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
  ];

  const navDescriptions: Record<DashboardSection, string> = {
    overview: 'Executive gateway glance & live telemetry',
    guide: 'Architecture walkthrough & protocol guide',
    value: 'USDT redemption & solver compute earnings',
    identity: 'Ed25519 session keys & credit balances',
    request: 'OpenAI-compatible SSE inference stream',
    routing: 'Intent marketplace & solver execution',
    accounting: 'ACID double-entry transaction ledger',
    evidence: 'Live gateway telemetry & observed events',
  };

  return (
    <div className="app-layout" {...targetAttributes('decant-operator-console', 'none')}>
      {/* ── Left Mobile Drawer / Sidebar ── */}
      <div
        className={`mobile-drawer-backdrop ${isMobileNavOpen ? 'mobile-drawer-backdrop--visible' : ''}`}
        onClick={() => setIsMobileNavOpen(false)}
        aria-hidden={!isMobileNavOpen}
      />

      <aside
        className={`mobile-drawer ${isMobileNavOpen ? 'mobile-drawer--open' : ''}`}
        aria-label="Decant left mobile navigation sidebar"
      >
        <div className="mobile-drawer__header">
          <div className="mobile-drawer__brand">
            <span className="brand-mark" aria-hidden="true">
              <DecantLogoMark size={22} />
            </span>
            <div className="mobile-drawer__brand-text">
              <span className="mobile-drawer__brand-title">DECANT</span>
              <span className="mobile-drawer__brand-subtitle">PROTOCOL</span>
            </div>
          </div>
          <button
            type="button"
            className="mobile-drawer__close-btn"
            onClick={() => setIsMobileNavOpen(false)}
            aria-label="Close navigation sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mobile-drawer__section-label mono">WORKSPACES</div>

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
                <span className="mobile-drawer__item-icon">{cat.icon}</span>
                <div className="mobile-drawer__item-text">
                  <span className="mobile-drawer__item-label">{cat.label}</span>
                  <span className="mobile-drawer__item-desc">{navDescriptions[cat.id]}</span>
                </div>
                {isActive && <span className="mobile-drawer__active-indicator" />}
              </button>
            );
          })}
        </nav>

        <div className="mobile-drawer__footer">
          <div className="mobile-drawer__health">
            <span className={`status-indicator status-indicator--${gatewayTone}`} aria-hidden="true" />
            <span className="mobile-drawer__health-label">NEAR GATEWAY {healthLabel}</span>
          </div>
          <button
            type="button"
            className="mobile-drawer__refresh mono"
            onClick={() => {
              handleRefresh();
              setIsMobileNavOpen(false);
            }}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>
      </aside>

      {/* ── Main Operations Workspace ── */}
      <div className="layout-content layout-content--full">
        <div className="app-shell">
          <header className="topbar" {...targetAttributes('decant-global-header', 'panel')}>
            <div className="topbar__left">
              {/* Mobile Hamburger Button */}
              <button
                type="button"
                className="mobile-nav-toggle"
                onClick={() => setIsMobileNavOpen(true)}
                aria-label="Open left navigation sidebar"
                aria-expanded={isMobileNavOpen}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
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
                <span className="brand-mark" aria-hidden="true">
                  <DecantLogoMark size={20} />
                </span>
                <span className="brand-name">DECANT</span>
                <span className="brand-descriptor">PROTOCOL</span>
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
                    <span className="topbar-tab__icon" aria-hidden="true">
                      {cat.icon}
                    </span>
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

              <span className="topbar__sync mono">
                {dashboard.state.lastRefreshAt === null
                  ? 'LAST SYNC —'
                  : `SYNC ${formatDateTime(dashboard.state.lastRefreshAt)}`}
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

            {/* ── Section 2: Compute-to-Value (USDT Redemption) ── */}
            {activeSection === 'value' && (
              <div className="workspace-view" key="value">
                <div className="workspace-header">
                  <div>
                    <div className="workspace-header__title">
                      <h2>Compute-to-Value Engine</h2>
                      <span className="source-badge">NEAR ON-CHAIN SETTLEMENT</span>
                    </div>
                    <p className="workspace-header__desc">
                      Convert DePIN and solver compute earnings into spendable USDT value at fixed rate (1,000 credits = $1.00 USDT).
                    </p>
                  </div>
                </div>
                <ValueAccrualCard onSuccess={() => void dashboard.refresh()} />
                <TransactionAudit transactions={dashboard.state.transactions} />
              </div>
            )}

            {/* ── Section 2: Identity & Credit ── */}
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
                  />
                  <TransactionAudit transactions={dashboard.state.transactions} />
                </div>
              </div>
            )}

            {/* ── Section 3: Session-Scoped Request (Inference Stream) ── */}
            {activeSection === 'request' && (
              <div className="workspace-view" key="request">
                <div className="workspace-header">
                  <div>
                    <div className="workspace-header__title">
                      <h2>Session-scoped request</h2>
                      <span className="source-badge">LIVE SSE INFERENCE</span>
                    </div>
                    <p className="workspace-header__desc">
                      Real-time token streaming with atomic quota deduction. Intercepted payloads reject with HTTP 403; exhausted quotas halt with HTTP 402.
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
                  />
                  <StreamViewer
                    sessions={dashboard.state.sessions}
                    selectedSessionId={dashboard.state.selectedSessionId}
                    stream={dashboard.state.stream}
                    now={now}
                    initialModel={selectedModel}
                    onSelectSession={dashboard.selectSession}
                    onRun={dashboard.runInference}
                  />
                </div>
              </div>
            )}

            {/* ── Section 4: Routing & Settlement (Intent Board) ── */}
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

            {/* ── Section 5: Accounting & Reconciliation (Transaction Audit) ── */}
            {activeSection === 'accounting' && (
              <div className="workspace-view" key="accounting">
                <div className="workspace-header">
                  <div>
                    <div className="workspace-header__title">
                      <h2>Accounting / reconciliation</h2>
                      <span className="source-badge">SQLITE ACID LEDGER</span>
                    </div>
                    <p className="workspace-header__desc">
                      Immutable record of prompt/completion tokens burned, upstream latency, and cost reconciliation.
                    </p>
                  </div>
                </div>

                <div className="workspace-view--single">
                  <TransactionAudit transactions={dashboard.state.transactions} />
                </div>
              </div>
            )}

            {/* ── Section 6: Observed Evidence (Telemetry & Gateway Logs) ── */}
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
            <span>Gateway records and this console's observed requests only</span>
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
    </div>
  );
}
