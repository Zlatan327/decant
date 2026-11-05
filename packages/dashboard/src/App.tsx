import { useEffect, useState } from 'react';
import { gatewayTargetLabel } from './api/client';
import { ActivityFeed } from './components/ActivityFeed';
import { DecantLogoMark } from './components/DecantLogo';
import { CentralMinimalistHero } from './components/CentralMinimalistHero';
import { ValueAccrualCard } from './components/ValueAccrualCard';
import { HealthBar } from './components/HealthBar';
import { IntentBoard } from './components/IntentBoard';
import { SessionPanel } from './components/SessionPanel';
import { StreamViewer } from './components/StreamViewer';
import { TransactionAudit } from './components/TransactionAudit';
import type { DashboardSection } from './components/SidebarNav';
import { formatDateTime } from './domain/format';
import { useDashboardData } from './hooks/useDashboardData';
import { targetAttributes } from './components/targets';

export function App() {
  const dashboard = useDashboardData();
  const [now, setNow] = useState(() => Date.now());
  const [activeSection, setActiveSection] = useState<DashboardSection>('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const categories: { id: DashboardSection; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'value', label: 'Compute Value' },
    { id: 'identity', label: 'Sessions & Quotas' },
    { id: 'request', label: 'Inference Stream' },
    { id: 'routing', label: 'Intent Marketplace' },
    { id: 'accounting', label: 'Transactions Ledger' },
    { id: 'evidence', label: 'Activity Feed' },
  ];

  return (
    <div className="app-layout" {...targetAttributes('decant-operator-console', 'none')}>
      {/* ── Main Operations Workspace ── */}
      <div className="layout-content layout-content--full">
        <div className="app-shell">
          <header className="topbar" {...targetAttributes('decant-global-header', 'panel')}>
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
              <span className="brand-divider" aria-hidden="true" />
              <span className="brand-descriptor">GATEWAY</span>
            </a>

            {/* ── Clean Unified Top Navigation ── */}
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
                    data-render-target={`category-tab-${cat.id}`}
                  >
                    <span>{cat.label}</span>
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
                {isRefreshing ? 'SYNCING...' : 'REFRESH'}
              </button>
            </div>
          </header>

          <main id="main-content" className="app-main" {...targetAttributes('decant-main-content', 'none')}>
            {/* ── Section 1: All Overview ── */}
            {activeSection === 'overview' && (
              <div className="workspace-view" key="overview">
                <CentralMinimalistHero />

                <HealthBar
                  resource={dashboard.state.health}
                  now={now}
                  apiTarget={gatewayTargetLabel()}
                  onRefresh={handleRefresh}
                />
              </div>
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
                <ValueAccrualCard />
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
