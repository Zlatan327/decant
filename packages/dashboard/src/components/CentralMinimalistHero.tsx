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

interface ProtocolLayer {
  label: string;
  detail: string;
  section: DashboardSection;
}

export interface CentralMinimalistHeroProps {
  onNavigate?: (section: DashboardSection, model?: string) => void;
}

function brandMark(icon: SimpleIcon, color: string): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d={icon.path} fill={color} />
    </svg>
  );
}

const PROVIDERS: Provider[] = [
  {
    id: 'gemini',
    label: 'Gemini',
    mark: brandMark(siGooglegemini, '#9A83BD'),
    section: 'request',
    model: 'gemini-3.8-flash',
  },
  {
    id: 'llama',
    label: 'Meta Llama',
    mark: brandMark(siMeta, '#73A8E8'),
    section: 'request',
    model: 'meta-llama/Meta-Llama-3-8B-Instruct',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    mark: <img src="/brand/openai-wordmark.svg" alt="" />,
    section: 'request',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    mark: brandMark(siAnthropic, '#D6B899'),
    section: 'request',
  },
];

const PROTOCOL_LAYERS: ProtocolLayer[] = [
  { label: 'Settlement', detail: 'NEAR Protocol', section: 'value' },
  { label: 'Compute', detail: 'Solver network', section: 'routing' },
  { label: 'Accounting', detail: 'Persistent ledger', section: 'accounting' },
  { label: 'Identity', detail: 'Scoped session keys', section: 'identity' },
];

export function CentralMinimalistHero({ onNavigate }: CentralMinimalistHeroProps = {}) {
  return (
    <section className="minimalist-hero" {...targetAttributes('decant-minimalist-hero', 'panel')}>
      <div className="minimalist-hero__glow" aria-hidden="true" />
      <div className="minimalist-hero__inner">
        <div className="minimalist-hero__eyebrow">
          <span>DECANT <i>/</i> COMPUTE ROUTING</span>
          <span className="minimalist-hero__eyebrow-index">BUILT ON NEAR</span>
        </div>

        <div className="minimalist-hero__copy">
          <h1 className="minimalist-hero__headline">
            Compute, routed.<br />
            <em>Credits, settled.</em>
          </h1>
          <p className="minimalist-hero__lead">
            One gateway for AI inference, scoped compute credits, and auditable settlement on NEAR.
          </p>
        </div>

        <div className="minimalist-hero__providers">
          <div className="minimalist-hero__section-label">
            <span>MODEL PROVIDERS</span>
            <span>Choose a route <i>·</i> select a model</span>
          </div>
          <div className="provider-strip" role="list" aria-label="AI model providers">
            {PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={`provider-link provider-link--${provider.id}`}
                onClick={() => onNavigate?.(provider.section, provider.model)}
                aria-label={`Open inference with ${provider.label}`}
                data-render-target={`provider-${provider.id}`}
              >
                <span className="provider-link__mark">{provider.mark}</span>
                <span className="provider-link__label">{provider.label}</span>
                <span className="provider-link__arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </div>

        <div className="protocol-strip" role="list" aria-label="Protocol infrastructure">
          {PROTOCOL_LAYERS.map((layer) => (
            <button
              key={layer.label}
              type="button"
              className="protocol-link"
              onClick={() => onNavigate?.(layer.section)}
              role="listitem"
              aria-label={`${layer.label}: ${layer.detail}`}
            >
              <span className="protocol-link__label">{layer.label}</span>
              <span className="protocol-link__detail">{layer.detail}</span>
            </button>
          ))}
        </div>

        <p className="minimalist-hero__attribution">
          Provider names and marks are trademarks of their respective owners.
        </p>
      </div>
    </section>
  );
}
