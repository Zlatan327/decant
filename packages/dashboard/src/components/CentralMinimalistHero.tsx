import type { ReactNode } from 'react';
import { siAnthropic, siGooglegemini, siMeta, type SimpleIcon } from 'simple-icons';
import type { DashboardSection } from './SidebarNav';
import { targetAttributes } from './targets';

interface Provider {
  id: string;
  label: string;
  mark: ReactNode;
  section: DashboardSection;
  model?: string;
}

export interface CentralMinimalistHeroProps {
  onNavigate?: (section: DashboardSection, model?: string) => void;
}

function brandMark(icon: SimpleIcon, color: string): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
      <path d={icon.path} fill={color} />
    </svg>
  );
}

const PROVIDERS: Provider[] = [
  {
    id: 'gemini',
    label: 'gemini',
    mark: brandMark(siGooglegemini, '#ffffff'),
    section: 'request',
    model: 'gemini-3.8-flash',
  },
  {
    id: 'llama',
    label: 'llama',
    mark: brandMark(siMeta, '#ffffff'),
    section: 'request',
    model: 'meta-llama/Meta-Llama-3-8B-Instruct',
  },
  {
    id: 'openai',
    label: 'openai',
    mark: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M22.28 9.38a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9 6.06 6.06 0 0 0-4.63-2.07 6.13 6.13 0 0 0-5.83 4.25 6.04 6.04 0 0 0-3.9 2.83 6.08 6.08 0 0 0 .74 7.15 6.04 6.04 0 0 0 .52 4.9 6.06 6.06 0 0 0 6.52 2.9 6.04 6.04 0 0 0 4.62 2.07 6.13 6.13 0 0 0 5.83-4.25 6.03 6.03 0 0 0 3.9-2.83 6.07 6.07 0 0 0-.74-7.15z" />
      </svg>
    ),
    section: 'request',
    model: 'gpt-4o',
  },
  {
    id: 'claude',
    label: 'claude',
    mark: brandMark(siAnthropic, '#ffffff'),
    section: 'request',
    model: 'claude-3-5-sonnet',
  },
];

export function CentralMinimalistHero({ onNavigate }: CentralMinimalistHeroProps = {}) {
  return (
    <div className="found-hero" {...targetAttributes('decant-hero-section', 'panel')}>
      {/* ── Giant Centered Wordmark ── */}
      <div className="found-wordmark" aria-hidden="true">
        decant
      </div>

      {/* ── Floating Glass Telemetry Card ── */}
      <div
        className="found-card"
        onClick={() => onNavigate?.('routing')}
        role="button"
        tabIndex={0}
        title="View live solver telemetry & routing intents"
      >
        <div className="found-card__header">
          <div className="found-card__title">Support the solvers</div>
          <div className="found-card__sub">route with an agent</div>
        </div>
        <div className="found-card__footer">
          <div className="found-card__status">
            <span>LIVE</span>
            <span>NEAR LEGION</span>
          </div>
          <div className="found-card__progress">
            <div className="found-card__progress-fill" style={{ width: '46%' }} />
          </div>
        </div>
      </div>

      {/* ── Editorial Lowercase Headline ── */}
      <h1 className="found-headline">
        decentralized<br />intent gateway
      </h1>

      {/* ── Lowercase Tagline ── */}
      <p className="found-tagline">
        Autonomous AI compute credit routing & settlement on NEAR.
      </p>

      {/* ── Direct Action & Route Quick-Pills ── */}
      <div className="found-actions">
        <button
          type="button"
          className="found-action-btn found-action-btn--primary"
          onClick={() => onNavigate?.('shop')}
        >
          open store ↗
        </button>
        <button
          type="button"
          className="found-action-btn found-action-btn--glass"
          onClick={() => onNavigate?.('request')}
        >
          live inference ⚡
        </button>
        <div className="found-routes">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="found-route-pill"
              onClick={() => onNavigate?.(p.section, p.model)}
              title={`Direct route to ${p.label}`}
            >
              <span className="found-route-pill__mark">{p.mark}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Fixed Interaction Hint ── */}
      <div className="found-hint" aria-hidden="true">
        Del / Backspace — clear intent · Double-click — inspect solver node
      </div>
    </div>
  );
}
