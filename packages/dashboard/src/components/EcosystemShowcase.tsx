import type { ReactNode } from 'react';
import { targetAttributes } from './targets';

/**
 * Ecosystem showcase — Framer-style icon grid showing the settlement layer,
 * supported upstream model providers, infrastructure primitives, and compute
 * solver types that the DECANT gateway routes through.
 *
 * None of these are "partners." They are:
 *   - NEAR Protocol: the on-chain settlement and session-key layer DECANT is built on
 *   - Model providers: upstream LLMs the gateway can proxy inference to
 *   - DePIN solvers: decentralized compute nodes that fill intents
 *   - Infrastructure: cryptographic and storage primitives the gateway uses
 */

interface LogoTile {
  id: string;
  label: string;
  sublabel: string;
  icon: ReactNode;
  featured?: boolean;
}

const TILES: LogoTile[] = [
  {
    id: 'decant',
    label: 'DECANT',
    sublabel: 'Settlement gateway',
    featured: true,
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="dg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00EC97"/>
            <stop offset="100%" stopColor="#00C9A7"/>
          </linearGradient>
        </defs>
        <path d="M20 16 L20 48" stroke="url(#dg)" strokeWidth="4.5" strokeLinecap="round"/>
        <path d="M20 16 L34 16 Q48 16 48 32 Q48 48 34 48 L20 48" stroke="url(#dg)" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
        <path d="M28 24 L38 32 L28 40" stroke="url(#dg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.6"/>
      </svg>
    ),
  },
  {
    id: 'near',
    label: 'NEAR Protocol',
    sublabel: 'Settlement layer',
    featured: true,
    icon: (
      /* Official NEAR Protocol "N" mark — the on-chain layer DECANT settles on */
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M21.443 0c-.89 0-1.714.46-2.18 1.218l-5.017 7.448a.533.533 0 0 0 .792.7l4.938-4.282a.2.2 0 0 1 .334.151v13.41a.2.2 0 0 1-.354.128L5.03.905A2.555 2.555 0 0 0 3.078 0h-.521A2.557 2.557 0 0 0 0 2.557v18.886a2.557 2.557 0 0 0 4.736 1.338l5.017-7.448a.533.533 0 0 0-.792-.7l-4.938 4.283a.2.2 0 0 1-.333-.152V5.352a.2.2 0 0 1 .354-.128l14.924 17.87c.486.574 1.2.905 1.952.906h.521A2.558 2.558 0 0 0 24 21.445V2.557A2.558 2.558 0 0 0 21.443 0Z" fill="#00EC97"/>
      </svg>
    ),
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    sublabel: 'Upstream provider',
    icon: (
      /* Gemini spark — upstream model the gateway proxies to */
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 8 C32 22 22 32 8 32 C22 32 32 42 32 56 C32 42 42 32 56 32 C42 32 32 22 32 8Z" fill="url(#gem-grad)"/>
        <defs>
          <linearGradient id="gem-grad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4285F4"/>
            <stop offset="50%" stopColor="#9B72CB"/>
            <stop offset="100%" stopColor="#D96570"/>
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
      /* Llama — upstream open-weight model */
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 14 C22 14 20 28 22 36 C24 44 30 48 38 48 L46 48" stroke="#A78BFA" strokeWidth="4" strokeLinecap="round" fill="none"/>
        <circle cx="24" cy="14" r="4" fill="#A78BFA"/>
        <path d="M22 26 C18 30 16 34 18 38" stroke="#A78BFA" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5"/>
      </svg>
    ),
  },
  {
    id: 'openai',
    label: 'OpenAI',
    sublabel: 'Upstream provider',
    icon: (
      /* OpenAI — upstream model provider */
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 12 L50 22 L50 42 L32 52 L14 42 L14 22 Z" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" fill="none"/>
        <path d="M32 12 L32 32 M50 22 L32 32 M14 22 L32 32" stroke="rgba(255,255,255,0.4)" strokeWidth="2" fill="none"/>
        <circle cx="32" cy="32" r="4" fill="rgba(255,255,255,0.8)"/>
      </svg>
    ),
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    sublabel: 'Upstream provider',
    icon: (
      /* Anthropic — upstream model provider */
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 46 L32 16 L44 46" stroke="#D4A574" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M25 36 L39 36" stroke="#D4A574" strokeWidth="3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'depin',
    label: 'DePIN Compute',
    sublabel: 'Solver network',
    icon: (
      /* Distributed compute nodes — DePIN solvers that fill compute intents */
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="32" cy="20" r="5" stroke="#22c55e" strokeWidth="2.5" fill="none"/>
        <circle cx="18" cy="44" r="5" stroke="#22c55e" strokeWidth="2.5" fill="none"/>
        <circle cx="46" cy="44" r="5" stroke="#22c55e" strokeWidth="2.5" fill="none"/>
        <path d="M32 25 L18 39 M32 25 L46 39 M18 44 L46 44" stroke="#22c55e" strokeWidth="1.5" opacity="0.5"/>
      </svg>
    ),
  },
  {
    id: 'sqlite',
    label: 'SQLite Ledger',
    sublabel: 'ACID storage',
    icon: (
      /* Database cylinder — persistent credit ledger */
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="32" cy="18" rx="16" ry="6" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" fill="none"/>
        <path d="M16 18 L16 46 C16 49.3 23.2 52 32 52 C40.8 52 48 49.3 48 46 L48 18" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" fill="none"/>
        <path d="M16 30 C16 33.3 23.2 36 32 36 C40.8 36 48 33.3 48 30" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none"/>
      </svg>
    ),
  },
  {
    id: 'ed25519',
    label: 'Ed25519',
    sublabel: 'Session keys',
    icon: (
      /* Shield — cryptographic session key verification */
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 10 L48 20 L48 36 C48 46 40 52 32 56 C24 52 16 46 16 36 L16 20 Z" stroke="#f59e0b" strokeWidth="2.5" fill="none"/>
        <path d="M28 32 L32 36 L40 26" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
  },
];

export function EcosystemShowcase() {
  return (
    <section className="ecosystem-showcase" {...targetAttributes('decant-ecosystem-showcase', 'panel')}>
      <div className="ecosystem-showcase__header">
        <p className="ecosystem-showcase__eyebrow">DECENTRALIZED INTENT SETTLEMENT</p>
        <h2 className="ecosystem-showcase__title">
          Route AI compute across
          <br />
          any model, any solver
        </h2>
        <p className="ecosystem-showcase__desc">
          On-chain settlement on NEAR. Scoped Ed25519 session keys.
          Persistent ACID credit ledger. Real-time SSE streaming to any upstream provider.
        </p>
      </div>

      <div className="ecosystem-showcase__grid" role="list" aria-label="Supported models, infrastructure, and settlement layers">
        {TILES.map((tile) => (
          <div
            key={tile.id}
            className={`ecosystem-tile ${tile.featured ? 'ecosystem-tile--featured' : ''}`}
            role="listitem"
            aria-label={`${tile.label} — ${tile.sublabel}`}
            data-render-target={`ecosystem-tile-${tile.id}`}
            data-motion-trigger="interaction"
          >
            <div className="ecosystem-tile__icon">
              {tile.icon}
            </div>
            <span className="ecosystem-tile__label">{tile.label}</span>
            <span className="ecosystem-tile__sublabel">{tile.sublabel}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
