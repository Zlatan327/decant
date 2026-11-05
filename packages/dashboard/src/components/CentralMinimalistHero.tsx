import type { ReactNode } from 'react';
import { targetAttributes } from './targets';

/**
 * CentralMinimalistHero — Minimalist gallery-grade hero showcase.
 *
 * Inspired by high-end design archives and editorial brand showcases:
 * - Pure pitch-black canvas
 * - Monumental central emblem featuring DECANT and NEAR Protocol
 * - Ethereal airbrush neon green (#00EC97) spray/glow aura
 * - Editorial metadata on the left flank (Track 07, verification stamps, architecture)
 * - Framer-style squircle dock of upstream models and solver infrastructure
 *
 * Note: None of these are "partners" — they are upstream providers, solvers,
 * and settlement infrastructure.
 */

interface SquircleTile {
  id: string;
  label: string;
  sublabel: string;
  icon: ReactNode;
  featured?: boolean;
}

const TILES: SquircleTile[] = [
  {
    id: 'decant',
    label: 'DECANT',
    sublabel: 'Settlement gateway',
    featured: true,
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sq-decant-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00EC97" />
            <stop offset="100%" stopColor="#00C9A7" />
          </linearGradient>
        </defs>
        <path d="M20 16 L20 48" stroke="url(#sq-decant-g)" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M20 16 L34 16 Q48 16 48 32 Q48 48 34 48 L20 48" stroke="url(#sq-decant-g)" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        <path d="M28 24 L38 32 L28 40" stroke="url(#sq-decant-g)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.6" />
      </svg>
    ),
  },
  {
    id: 'near',
    label: 'NEAR Protocol',
    sublabel: 'Settlement layer',
    featured: true,
    icon: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M21.443 0c-.89 0-1.714.46-2.18 1.218l-5.017 7.448a.533.533 0 0 0 .792.7l4.938-4.282a.2.2 0 0 1 .334.151v13.41a.2.2 0 0 1-.354.128L5.03.905A2.555 2.555 0 0 0 3.078 0h-.521A2.557 2.557 0 0 0 0 2.557v18.886a2.557 2.557 0 0 0 4.736 1.338l5.017-7.448a.533.533 0 0 0-.792-.7l-4.938 4.283a.2.2 0 0 1-.333-.152V5.352a.2.2 0 0 1 .354-.128l14.924 17.87c.486.574 1.2.905 1.952.906h.521A2.558 2.558 0 0 0 24 21.445V2.557A2.558 2.558 0 0 0 21.443 0Z" fill="#00EC97" />
      </svg>
    ),
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    sublabel: 'Upstream provider',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 8 C32 22 22 32 8 32 C22 32 32 42 32 56 C32 42 42 32 56 32 C42 32 32 22 32 8Z" fill="url(#gem-sq-grad)" />
        <defs>
          <linearGradient id="gem-sq-grad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4285F4" />
            <stop offset="50%" stopColor="#9B72CB" />
            <stop offset="100%" stopColor="#D96570" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'llama',
    label: 'Meta Llama',
    sublabel: 'Upstream provider',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 14 C22 14 20 28 22 36 C24 44 30 48 38 48 L46 48" stroke="#A78BFA" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="24" cy="14" r="4" fill="#A78BFA" />
        <path d="M22 26 C18 30 16 34 18 38" stroke="#A78BFA" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'openai',
    label: 'OpenAI',
    sublabel: 'Upstream provider',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 12 L50 22 L50 42 L32 52 L14 42 L14 22 Z" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" fill="none" />
        <path d="M32 12 L32 32 M50 22 L32 32 M14 22 L32 32" stroke="rgba(255,255,255,0.4)" strokeWidth="2" fill="none" />
        <circle cx="32" cy="32" r="4" fill="rgba(255,255,255,0.8)" />
      </svg>
    ),
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    sublabel: 'Upstream provider',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 46 L32 16 L44 46" stroke="#D4A574" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M25 36 L39 36" stroke="#D4A574" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'depin',
    label: 'DePIN Compute',
    sublabel: 'Solver network',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="20" r="5" stroke="#22c55e" strokeWidth="2.5" fill="none" />
        <circle cx="18" cy="44" r="5" stroke="#22c55e" strokeWidth="2.5" fill="none" />
        <circle cx="46" cy="44" r="5" stroke="#22c55e" strokeWidth="2.5" fill="none" />
        <path d="M32 25 L18 39 M32 25 L46 39 M18 44 L46 44" stroke="#22c55e" strokeWidth="1.5" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'sqlite',
    label: 'SQLite Ledger',
    sublabel: 'ACID storage',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="32" cy="18" rx="16" ry="6" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" fill="none" />
        <path d="M16 18 L16 46 C16 49.3 23.2 52 32 52 C40.8 52 48 49.3 48 46 L48 18" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" fill="none" />
        <path d="M16 30 C16 33.3 23.2 36 32 36 C40.8 36 48 33.3 48 30" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" />
      </svg>
    ),
  },
  {
    id: 'ed25519',
    label: 'Ed25519',
    sublabel: 'Session keys',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 10 L48 20 L48 36 C48 46 40 52 32 56 C24 52 16 46 16 36 L16 20 Z" stroke="#f59e0b" strokeWidth="2.5" fill="none" />
        <path d="M28 32 L32 36 L40 26" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
];

export function CentralMinimalistHero() {
  return (
    <section className="minimalist-hero" {...targetAttributes('decant-minimalist-hero', 'panel')}>
      {/* ── Background Airbrush Atmosphere ── */}
      <div className="minimalist-hero__glow" aria-hidden="true" />

      <div className="minimalist-hero__layout">
        {/* ── Left Flank Editorial Metadata (Inspired by Archive Reference) ── */}
        <aside className="minimalist-hero__editorial" aria-label="Project and track metadata">
          <div className="editorial-index">07</div>
          <div className="editorial-subtitle">Agent Economy &amp; Settlement</div>

          <div className="editorial-meta-group">
            <span className="editorial-meta-label">Decant <span className="dash">—</span></span>
            <span className="editorial-meta-val">Autonomous Compute Routing</span>
          </div>

          <div className="editorial-meta-group">
            <span className="editorial-meta-year">2026</span>
            <span className="editorial-meta-val">NEAR Protocol Hackathon</span>
          </div>

          <div className="editorial-badges" role="list" aria-label="Verification gates">
            <div className="editorial-badge" role="listitem">
              <span className="editorial-badge__icon" aria-hidden="true">✓</span>
              <div className="editorial-badge__content">
                <span className="editorial-badge__title">34/34 Test Gates</span>
                <span className="editorial-badge__caption">Deterministic verification</span>
              </div>
            </div>

            <div className="editorial-badge" role="listitem">
              <span className="editorial-badge__icon" aria-hidden="true">🛡</span>
              <div className="editorial-badge__content">
                <span className="editorial-badge__title">0% Gray Market</span>
                <span className="editorial-badge__caption">Pure DePIN &amp; upstream APIs</span>
              </div>
            </div>

            <div className="editorial-badge" role="listitem">
              <span className="editorial-badge__icon" aria-hidden="true">⚡</span>
              <div className="editorial-badge__content">
                <span className="editorial-badge__title">Compute-to-USDT</span>
                <span className="editorial-badge__caption">On-chain credit redemption</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Central Monument: DECANT × NEAR Glowing Spray Insignia ── */}
        <div className="minimalist-hero__center">
          <div className="monument-emblem" aria-label="DECANT and NEAR Protocol joint architectural insignia">
            <svg
              className="monument-svg"
              viewBox="0 0 540 220"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="DECANT and NEAR Protocol central glowing mark"
            >
              <defs>
                {/* SVG airbrush spray texture & luminous bloom filter */}
                <filter id="airbrush-spray" x="-40%" y="-40%" width="180%" height="180%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" result="noise" />
                  <feColorMatrix type="matrix" values="0 0 0 0 0   0 0 0 0 0.92   0 0 0 0 0.59  0 0 0 0.25 0" in="noise" result="tintedNoise" />
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="softBlur" />
                  <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="bloom1" />
                  <feGaussianBlur in="SourceGraphic" stdDeviation="24" result="bloom2" />
                  <feMerge>
                    <feMergeNode in="bloom2" />
                    <feMergeNode in="bloom1" />
                    <feMergeNode in="tintedNoise" />
                    <feMergeNode in="softBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>

                {/* Pure NEAR green gradient */}
                <linearGradient id="near-mint-flow" x1="0" y1="0" x2="540" y2="220" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#00EC97" />
                  <stop offset="45%" stopColor="#00F5A0" />
                  <stop offset="100%" stopColor="#00EC97" />
                </linearGradient>
              </defs>

              {/* ── LEFT: DECANT Architectural Gateway Glyph ── */}
              <g transform="translate(40, 20) scale(2.8)" filter="url(#airbrush-spray)">
                {/* Outer Crystalline D Backbone */}
                <path
                  d="M14 10 L14 54"
                  stroke="url(#near-mint-flow)"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                />
                <path
                  d="M14 10 L30 10 Q48 10 48 32 Q48 54 30 54 L14 54"
                  stroke="url(#near-mint-flow)"
                  strokeWidth="5.5"
                  strokeLinecap="round"
                  fill="none"
                />
                {/* Routing Funnel / Flow Chevron */}
                <path
                  d="M23 20 L35 32 L23 44"
                  stroke="url(#near-mint-flow)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity="0.9"
                />
              </g>

              {/* ── CENTER: Intent Settlement Conduit ── */}
              <g transform="translate(225, 95)" opacity="0.75" filter="url(#airbrush-spray)">
                <circle cx="20" cy="15" r="4" fill="#00EC97" />
                <path
                  d="M32 15 L58 15"
                  stroke="#00EC97"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                />
                <circle cx="70" cy="15" r="4" fill="#00EC97" />
              </g>

              {/* ── RIGHT: Official NEAR Protocol Mark ── */}
              <g transform="translate(340, 26) scale(7.2)" filter="url(#airbrush-spray)">
                <path
                  d="M21.443 0c-.89 0-1.714.46-2.18 1.218l-5.017 7.448a.533.533 0 0 0 .792.7l4.938-4.282a.2.2 0 0 1 .334.151v13.41a.2.2 0 0 1-.354.128L5.03.905A2.555 2.555 0 0 0 3.078 0h-.521A2.557 2.557 0 0 0 0 2.557v18.886a2.557 2.557 0 0 0 4.736 1.338l5.017-7.448a.533.533 0 0 0-.792-.7l-4.938 4.283a.2.2 0 0 1-.333-.152V5.352a.2.2 0 0 1 .354-.128l14.924 17.87c.486.574 1.2.905 1.952.906h.521A2.558 2.558 0 0 0 24 21.445V2.557A2.558 2.558 0 0 0 21.443 0Z"
                  fill="url(#near-mint-flow)"
                />
              </g>
            </svg>
          </div>

          {/* ── Hero Headings ── */}
          <div className="minimalist-hero__copy">
            <h1 className="minimalist-hero__headline">
              Route AI compute across
              <br />
              any model, any solver
            </h1>
            <p className="minimalist-hero__lead">
              Decentralized intent-settlement gateway on NEAR Protocol.
              Verifiable Ed25519 session keys, persistent ACID credit accounting,
              and live compute-to-USDT redemption.
            </p>
          </div>

          {/* ── Framer-Style Squircle Model & Solver Dock ── */}
          <div
            className="squircle-dock"
            role="list"
            aria-label="Supported settlement layer, upstream model providers, and solver infrastructure"
          >
            {TILES.map((tile) => (
              <div
                key={tile.id}
                className={`squircle-tile ${tile.featured ? 'squircle-tile--featured' : ''}`}
                role="listitem"
                aria-label={`${tile.label} — ${tile.sublabel}`}
                data-render-target={`squircle-tile-${tile.id}`}
              >
                <div className="squircle-tile__icon">{tile.icon}</div>
                <span className="squircle-tile__label">{tile.label}</span>
                <span className="squircle-tile__sublabel">{tile.sublabel}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
