import { useEffect, useState } from 'react';
import { gatewayTargetLabel } from './api/client';
import { ActivityFeed } from './components/ActivityFeed';
import { HealthBar } from './components/HealthBar';
import { IntentBoard } from './components/IntentBoard';
import { SessionPanel } from './components/SessionPanel';
import { StreamViewer } from './components/StreamViewer';
import { TransactionAudit } from './components/TransactionAudit';
import { formatDateTime } from './domain/format';
import { useDashboardData } from './hooks/useDashboardData';
import { targetAttributes } from './components/targets';

export function App() {
  const dashboard = useDashboardData();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const connected = dashboard.state.health.data !== null;
  const healthLabel = dashboard.state.health.data?.status.toUpperCase()
    ?? (dashboard.state.health.status === 'loading' ? 'CONNECTING' : 'OFFLINE');

  return (
    <div className="app-shell" {...targetAttributes('decant-operator-console', 'none')}>
      <header className="topbar" {...targetAttributes('decant-global-header', 'panel')}>
        <a className="brand-lockup" href="#main-content" aria-label="DECANT operator console home" data-render-target="decant-wordmark" data-motion-trigger="none">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span className="brand-name">DECANT</span>
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-descriptor">GATEWAY / OPS</span>
        </a>
        <div className="topbar__meta">
          <span className={`connection-chip ${connected ? 'connection-chip--connected' : ''}`} data-render-target="gateway-connection-state" data-motion-trigger="status">
            <span className="status-indicator" aria-hidden="true" />
            {healthLabel}
          </span>
          <span className="topbar__sync mono">{dashboard.state.lastRefreshAt === null ? 'LAST SYNC —' : `SYNC ${formatDateTime(dashboard.state.lastRefreshAt)}`}</span>
        </div>
      </header>

      <main id="main-content" className="app-main" {...targetAttributes('decant-main-content', 'none')}>
        <div className="page-intro" {...targetAttributes('operator-page-introduction', 'panel')}>
          <div>
            <p className="eyebrow">DECENTRALIZED INTENT SETTLEMENT GATEWAY</p>
            <h1>Operator console</h1>
            <p className="page-intro__copy">Live gateway state for agent sessions, compute-credit routing, request outcomes, and settlement records.</p>
          </div>
          <div className="page-intro__context">
            <span className="metric-label">API route</span>
            <code title={gatewayTargetLabel()}>{gatewayTargetLabel()}</code>
          </div>
        </div>

        <HealthBar
          resource={dashboard.state.health}
          now={now}
          apiTarget={gatewayTargetLabel()}
          onRefresh={() => { void dashboard.refresh(); }}
        />

        <div className="dashboard-grid" {...targetAttributes('decant-live-dashboard-grid', 'none')}>
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
          <ActivityFeed transactions={dashboard.state.transactions} events={dashboard.state.observedEvents} />
          <StreamViewer
            sessions={dashboard.state.sessions}
            selectedSessionId={dashboard.state.selectedSessionId}
            stream={dashboard.state.stream}
            now={now}
            onSelectSession={dashboard.selectSession}
            onRun={dashboard.runInference}
          />
        </div>

        <div className="audit-grid" {...targetAttributes('decant-intent-and-audit-grid', 'none')}>
          <IntentBoard
            intents={dashboard.state.intents}
            confirmedIntents={dashboard.state.consoleIntents}
            sessions={dashboard.state.sessions}
            selectedSessionId={dashboard.state.selectedSessionId}
            onBroadcast={dashboard.broadcastIntent}
            onFill={dashboard.fillIntent}
          />
          <TransactionAudit transactions={dashboard.state.transactions} />
        </div>
      </main>

      <footer className="app-footer" {...targetAttributes('decant-observability-boundary', 'status')}>
        <span>DECANT / OPERATIONS</span>
        <span>Gateway records and this console's observed requests only</span>
        <span className="mono">{connected ? 'SOURCE: LIVE API' : 'SOURCE: WAITING FOR API'}</span>
      </footer>
    </div>
  );
}
