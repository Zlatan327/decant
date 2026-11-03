import React from 'react';
import { targetAttributes } from './targets';

export type DashboardSection =
  | 'overview'
  | 'identity'
  | 'request'
  | 'routing'
  | 'accounting'
  | 'evidence';

export interface NavItem {
  id: DashboardSection;
  label: string;
  shortLabel: string;
  badge?: string;
  description: string;
  icon: React.ReactNode;
}

export interface SidebarNavProps {
  activeSection: DashboardSection;
  onSelectSection: (section: DashboardSection) => void;
  connected: boolean;
  gatewayTone?: 'healthy' | 'warning' | 'offline' | 'unknown';
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function SidebarNav({
  activeSection,
  onSelectSection,
  connected,
  gatewayTone,
  onRefresh,
  isRefreshing,
}: SidebarNavProps) {
  const effectiveTone = gatewayTone ?? (connected ? 'healthy' : 'offline');
  const navItems: NavItem[] = [
    {
      id: 'overview',
      label: 'Overview',
      shortLabel: 'All',
      description: 'Executive unified gateway glance and live telemetry',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      id: 'identity',
      label: 'Identity / credit',
      shortLabel: 'Credit',
      description: 'Ed25519 cryptographic keys, session quotas, and top-up controls',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          <circle cx="12" cy="16" r="1.5" />
        </svg>
      ),
    },
    {
      id: 'request',
      label: 'Session-scoped request',
      shortLabel: 'Inference',
      description: 'Incremental SSE token streaming, model selection, and circuit breakers',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <path d="M7 8l3 2.5-3 2.5" />
          <line x1="12" y1="13" x2="16" y2="13" />
        </svg>
      ),
    },
    {
      id: 'routing',
      label: 'Routing / settlement',
      shortLabel: 'Intents',
      description: 'Decentralized compute intents, solver bidding, and settlement matching',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      label: 'Accounting / reconciliation',
      shortLabel: 'Ledger',
      description: 'Persistent SQLite transaction audit trail, metered tokens, and cost units',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <line x1="9" y1="7" x2="15" y2="7" />
          <line x1="9" y1="11" x2="15" y2="11" />
        </svg>
      ),
    },
    {
      id: 'evidence',
      label: 'Observed evidence',
      shortLabel: 'Evidence',
      description: 'Live console request history, 401/402/403 status telemetry, and gate checks',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="sidebar-rail" {...targetAttributes('decant-sidebar-navigation', 'panel')}>
      <div className="sidebar-rail__top">
        <button
          type="button"
          className="sidebar-rail__logo"
          onClick={() => onSelectSection('overview')}
          title="DECANT Operator Console"
          aria-label="DECANT Home"
        >
          <span className="brand-mark" aria-hidden="true">D</span>
        </button>
      </div>

      <nav className="sidebar-rail__nav" aria-label="Main Navigation">
        <ul className="sidebar-rail__list">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <li key={item.id} className="sidebar-rail__item">
                <button
                  type="button"
                  className={`sidebar-rail__btn ${isActive ? 'sidebar-rail__btn--active' : ''}`}
                  onClick={() => onSelectSection(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={`${item.label} — ${item.description}`}
                  data-render-target={`nav-tab-${item.id}`}
                >
                  <span className="sidebar-rail__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="sidebar-rail__tooltip">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  {isActive && <span className="sidebar-rail__active-indicator" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-rail__bottom">
        <button
          type="button"
          className={`sidebar-rail__btn sidebar-rail__refresh-btn ${isRefreshing ? 'sidebar-rail__refresh-btn--spinning' : ''}`}
          onClick={onRefresh}
          title="Refresh gateway ledger and state"
          aria-label="Refresh gateway state"
          data-render-target="manual-refresh-trigger"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span className="sidebar-rail__tooltip">
            <strong>Refresh Gateway</strong>
            <small>Poll latest SQLite & NEAR state</small>
          </span>
        </button>

        <div
          className={`sidebar-rail__status-dot sidebar-rail__status-dot--${effectiveTone}`}
          title={`Gateway: ${effectiveTone.toUpperCase()}${connected ? ' (LIVE)' : ''}`}
          aria-label={`Gateway status: ${effectiveTone}`}
        />
      </div>
    </aside>
  );
}
