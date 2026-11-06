import type { ReactNode } from 'react';
import { siAnthropic, siGooglegemini, siMeta, siNear, type SimpleIcon } from 'simple-icons';
import type { DashboardSection } from './SidebarNav';
import { targetAttributes } from './targets';

/**
 * CentralMinimalistHero — Minimalist gallery-grade hero showcase.
 *
 * Sourced from the editorial redesign:
 * - Pure pitch-black canvas with ambient glow
 * - Monumental central emblem featuring DECANT and NEAR Protocol
 * - Authentic vector provider marks (Simple Icons & OpenAI vector wordmark)
 * - Interactive Framer-style squircle dock routing to each workspace section
 */

interface SquircleTile {
  id: string;
  label: string;
  sublabel: string;
  icon: ReactNode;
  featured?: boolean;
  brand?: boolean;
}

function brandMark(icon: SimpleIcon, color: string): ReactNode {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={`${icon.title} logo`} xmlns="http://www.w3.org/2000/svg">
      <path d={icon.path} fill={color} />
    </svg>
  );
}

const TILE_TARGETS: Record<string, { section: DashboardSection; model?: string }> = {
  decant: { section: 'guide' },
  near: { section: 'value' },
  gemini: { section: 'request', model: 'gemini-3.8-flash' },
  llama: { section: 'request', model: 'meta-llama/Meta-Llama-3-8B-Instruct' },
  openai: { section: 'request' },
  anthropic: { section: 'request' },
  depin: { section: 'routing' },
  sqlite: { section: 'accounting' },
  ed25519: { section: 'identity' },
};

export interface CentralMinimalistHeroProps {
  onNavigate?: (section: DashboardSection, model?: string) => void;
}

const TILES: SquircleTile[] = [
  {
    id: 'decant',
    label: 'DECANT',
    sublabel: 'Gateway',
    featured: true,
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 16 L20 48" stroke="#00EC97" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M20 16 L34 16 Q48 16 48 32 Q48 48 34 48 L20 48" stroke="#00EC97" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <path d="M28 24 L38 32 L28 40" stroke="#00C9A7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
  {
    id: 'near',
    label: 'NEAR',
    sublabel: 'Settlement',
    featured: true,
    icon: brandMark(siNear, '#00EC97'),
  },
  {
    id: 'gemini',
    label: 'Gemini',
    sublabel: 'Google',
    icon: brandMark(siGooglegemini, '#8E75B2'),
    brand: true,
  },
  {
    id: 'llama',
    label: 'Llama',
    sublabel: 'Meta open-weight',
    icon: brandMark(siMeta, '#4F9BFF'),
    brand: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    sublabel: 'Model provider',
    icon: <img src="/brand/openai-wordmark.svg" alt="" />,
    brand: true,
  },
  {
    id: 'anthropic',
    label: 'Claude',
    sublabel: 'Anthropic',
    icon: brandMark(siAnthropic, '#D6B899'),
    brand: true,
  },
  {
    id: 'depin',
    label: 'DePIN',
    sublabel: 'Solver network',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="20" r="5" stroke="#72DDB1" strokeWidth="2.5" />
        <circle cx="18" cy="44" r="5" stroke="#72DDB1" strokeWidth="2.5" />
        <circle cx="46" cy="44" r="5" stroke="#72DDB1" strokeWidth="2.5" />
        <path d="M32 25 L18 39 M32 25 L46 39 M18 44 L46 44" stroke="#72DDB1" strokeWidth="1.5" opacity="0.65" />
      </svg>
    ),
  },
  {
    id: 'sqlite',
    label: 'SQLite',
    sublabel: 'ACID ledger',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="32" cy="18" rx="16" ry="6" stroke="#AAB0B6" strokeWidth="2.5" />
        <path d="M16 18 L16 46 C16 49.3 23.2 52 32 52 C40.8 52 48 49.3 48 46 L48 18" stroke="#AAB0B6" strokeWidth="2.5" />
        <path d="M16 30 C16 33.3 23.2 36 32 36 C40.8 36 48 33.3 48 30" stroke="#AAB0B6" strokeWidth="1.5" opacity="0.65" />
      </svg>
    ),
  },
  {
    id: 'ed25519',
    label: 'Ed25519',
    sublabel: 'Session keys',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 10 L48 20 L48 36 C48 46 40 52 32 56 C24 52 16 46 16 36 L16 20 Z" stroke="#D4A85E" strokeWidth="2.5" />
        <path d="M28 32 L32 36 L40 26" stroke="#D4A85E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function CentralMinimalistHero({ onNavigate }: CentralMinimalistHeroProps = {}) {
  return (
    <section className="minimalist-hero" {...targetAttributes('decant-minimalist-hero', 'panel')}>
      {/* ── Background Ambient Glow ── */}
      <div className="minimalist-hero__glow" aria-hidden="true" />

      {/* ── Central Monument: DECANT × NEAR Glowing Insignia ── */}
      <div className="minimalist-hero__center">
        <div className="minimalist-hero__eyebrow">
          <span className="minimalist-hero__eyebrow-mark" aria-hidden="true" />
          <span>DECANT <i>/</i> COMPUTE ROUTING PROTOCOL</span>
          <span className="minimalist-hero__eyebrow-index">NEAR ECOSYSTEM&nbsp; · &nbsp;01</span>
        </div>

        <div className="monument-emblem" aria-label="DECANT routing mark with NEAR Protocol">
          <svg
            className="monument-svg"
            viewBox="0 0 540 220"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="DECANT and NEAR Protocol marks"
          >
            <defs>
              <filter id="neon-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur1" />
                <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur2" />
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="near-mint-flow" x1="0" y1="0" x2="540" y2="220" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#00EC97" />
                <stop offset="48%" stopColor="#78F2C3" />
                <stop offset="100%" stopColor="#00C9A7" />
              </linearGradient>
            </defs>
            <g
              transform="translate(40, 20) scale(2.8)"
              style={{ filter: 'drop-shadow(0 0 14px rgba(0, 236, 151, 0.55)) drop-shadow(0 0 36px rgba(0, 236, 151, 0.25))' }}
            >
              <path d="M14 10 L14 54" stroke="url(#near-mint-flow)" strokeWidth="5.5" strokeLinecap="round" />
              <path d="M14 10 L30 10 Q48 10 48 32 Q48 54 30 54 L14 54" stroke="url(#near-mint-flow)" strokeWidth="5.5" strokeLinecap="round" fill="none" />
              <path d="M23 20 L35 32 L23 44" stroke="url(#near-mint-flow)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
            <g transform="translate(225, 95)" opacity="0.8">
              <circle cx="20" cy="15" r="4" fill="#00EC97" />
              <path d="M32 15 L58 15" stroke="#00EC97" strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" />
              <circle cx="70" cy="15" r="4" fill="#00EC97" />
            </g>
            <g
              transform="translate(340, 26) scale(7.2)"
              style={{ filter: 'drop-shadow(0 0 16px rgba(0, 236, 151, 0.58)) drop-shadow(0 0 42px rgba(0, 236, 151, 0.26))' }}
            >
              <path d={siNear.path} fill="url(#near-mint-flow)" />
            </g>
          </svg>
        </div>

        <div className="minimalist-hero__copy">
          <h1 className="minimalist-hero__headline">
            Route any model.<br />
            <em>Settle every credit.</em>
          </h1>
          <p className="minimalist-hero__lead">
            A decentralized inference gateway with scoped session keys, an auditable compute-credit ledger, and settlement rails built on NEAR.
          </p>
        </div>

        <div className="squircle-dock__heading">
          <span>THE ROUTING STACK</span>
          <span>MODEL PROVIDERS <i>·</i> SETTLEMENT <i>·</i> INFRASTRUCTURE</span>
        </div>
        <div
          className="squircle-dock"
          role="list"
          aria-label="Model providers, settlement layer, and gateway infrastructure"
        >
          {TILES.map((tile) => {
            const target = TILE_TARGETS[tile.id];
            return (
              <button
                key={tile.id}
                type="button"
                className={`squircle-tile ${tile.featured ? 'squircle-tile--featured' : ''} ${tile.brand ? 'squircle-tile--brand' : ''}`}
                onClick={() => target && onNavigate?.(target.section, target.model)}
                role="listitem"
                aria-label={`${tile.label} — ${tile.sublabel}. Click to open ${target ? target.section : 'workspace'}`}
                title={`Explore ${tile.label} (${tile.sublabel})`}
                data-render-target={`squircle-tile-${tile.id}`}
              >
                <div className={`squircle-tile__icon ${tile.id === 'openai' ? 'squircle-tile__icon--wordmark' : ''}`}>
                  {tile.icon}
                </div>
                <span className="squircle-tile__label">{tile.label}</span>
                <span className="squircle-tile__sublabel">{tile.sublabel}</span>
              </button>
            );
          })}
        </div>
        <p className="minimalist-hero__attribution">
          Independent integrations · Provider names and marks belong to their respective owners.
        </p>
      </div>
    </section>
  );
}
