import { formatDateTime, formatUptime } from '../domain/format';
import type { ApiResource, GatewayHealth } from '../domain/types';
import { targetAttributes } from './targets';

interface HealthBarProps {
  resource: ApiResource<GatewayHealth>;
  now: number;
  apiTarget: string;
  onRefresh: () => void;
  showRefresh?: boolean;
}

function healthTone(resource: ApiResource<GatewayHealth>): string {
  if (!resource.data) return resource.status === 'error' || resource.status === 'unavailable' ? 'offline' : 'unknown';
  const status = resource.data.status.toLowerCase();
  if (['healthy', 'ok', 'operational'].includes(status)) return 'healthy';
  if (['degraded', 'warning', 'partial'].includes(status)) return 'warning';
  if (['offline', 'unhealthy', 'error'].includes(status)) return 'offline';
  return 'unknown';
}

function ledgerLabel(ledger: string | undefined): string {
  if (!ledger) return '—';
  if (ledger.includes('pgbouncer')) return 'PgBouncer + Postgres';
  return ledger.toLowerCase().includes('sqlite-acid-persistent') ? 'SQLite ACID' : ledger;
}

export function HealthBar({ resource, now, apiTarget, onRefresh, showRefresh = true }: HealthBarProps) {
  const health = resource.data;
  const tone = healthTone(resource);
  const uptimeTimestamp = health?.timestamp ?? resource.checkedAt;
  const uptime = health && uptimeTimestamp !== null
    ? health.uptime + Math.max(0, now - uptimeTimestamp) / 1_000
    : health?.uptime;
  const stateLabel = health?.status.toUpperCase()
    ?? (resource.status === 'loading' ? 'CONNECTING' : resource.status === 'error' ? 'UNAVAILABLE' : 'AWAITING HEALTH');

  const activeNode = health?.cluster?.nodeId ?? health?.nodeId ?? 'standalone';
  const redisState = health?.cluster?.redis?.connected ? 'CONNECTED' : (health?.cluster?.redis?.configured ? 'CONNECTING' : 'IN-MEMORY');

  return (
    <section className="health-rail panel" aria-label="Gateway health" {...targetAttributes('gateway-health-rail', 'status')}>
      <div className="health-rail__identity">
        <span className={`status-indicator status-indicator--${tone}`} aria-hidden="true" />
        <div>
          <p className="eyebrow">Gateway status</p>
          <p className="health-rail__state" data-status={tone}>{stateLabel}</p>
        </div>
      </div>
      <div className="health-rail__metrics">
        <div className="health-metric" {...targetAttributes('gateway-node-id', 'status')}>
          <span className="metric-label">Cluster node</span>
          <strong className="mono health-metric__node">{health ? activeNode.toUpperCase() : '—'}</strong>
        </div>
        <div className="health-metric" {...targetAttributes('gateway-redis-cache', 'status')}>
          <span className="metric-label">Redis cache</span>
          <strong className="mono">{health ? redisState : '—'}</strong>
        </div>
        <div className="health-metric" {...targetAttributes('gateway-uptime', 'status')}>
          <span className="metric-label">Uptime</span>
          <strong className="mono">{health ? formatUptime(uptime) : '—'}</strong>
        </div>
        <div className="health-metric" {...targetAttributes('gateway-ledger-status', 'status')}>
          <span className="metric-label">Ledger engine</span>
          <strong className="mono" title={health?.ledger}>{ledgerLabel(health?.ledger)}</strong>
        </div>
        <div className="health-metric" {...targetAttributes('gateway-near-sync', 'status')}>
          <span className="metric-label">NEAR sync</span>
          <strong className="mono">{health?.nearSync ?? '—'}</strong>
        </div>
        <div className="health-metric health-metric--target" {...targetAttributes('gateway-api-target', 'status')}>
          <span className="metric-label">API target</span>
          <strong className="mono" title={apiTarget}>{apiTarget}</strong>
        </div>
      </div>
      <div className="health-rail__actions">
        <span className="sync-label">
          {resource.checkedAt === null ? 'Last check —' : `Checked ${formatDateTime(resource.checkedAt)}`}
        </span>
        {showRefresh && <button
          type="button"
          className="button button--quiet"
          onClick={onRefresh}
          data-render-target="refresh-gateway-health"
          data-motion-trigger="interaction"
          aria-label="Refresh gateway health and dashboard data"
        >
          Refresh
        </button>}
      </div>
      {resource.message && !health && (
        <p className={`resource-message${resource.status === 'error' || resource.status === 'unavailable' ? ' resource-message--warning' : ''}`} role={resource.status === 'error' ? 'alert' : 'status'}>{resource.message}</p>
      )}
    </section>
  );
}
