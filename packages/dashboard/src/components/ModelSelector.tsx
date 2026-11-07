import { useState } from 'react';

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  badge: string;
  badgeTone: 'healthy' | 'neutral' | 'warning';
  description: string;
  speed: string;
  creditMultiplier: string;
  contextWindow: string;
}

export const PRESET_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    provider: 'Google DeepMind',
    badge: 'RECOMMENDED',
    badgeTone: 'healthy',
    description: 'Ultra-low latency, multimodal understanding, and high-throughput streaming.',
    speed: '~140 t/s',
    creditMultiplier: '1.0× quota',
    contextWindow: '1M tokens',
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    provider: 'Google DeepMind',
    badge: 'LIGHTEST',
    badgeTone: 'healthy',
    description: 'Fastest time-to-first-token with minimal compute quota consumption. Ideal for real-time agents.',
    speed: '~220 t/s',
    creditMultiplier: '0.5× quota',
    contextWindow: '512K tokens',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'Google DeepMind',
    badge: 'NEXT-GEN',
    badgeTone: 'neutral',
    description: 'Advanced reasoning, complex problem solving, and structured code synthesis.',
    speed: '~95 t/s',
    creditMultiplier: '1.5× quota',
    contextWindow: '1M tokens',
  },
];

interface ModelSelectorProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
  availableModels?: string[];
}

export function ModelSelector({
  selectedModel,
  onSelectModel,
  disabled = false,
  availableModels = [],
}: ModelSelectorProps) {
  const [isCustomMode, setIsCustomMode] = useState(
    !PRESET_MODELS.some((m) => m.id === selectedModel) && Boolean(selectedModel)
  );
  const [customInput, setCustomInput] = useState(
    !PRESET_MODELS.some((m) => m.id === selectedModel) ? selectedModel : ''
  );

  function handleSelect(id: string) {
    if (disabled) return;
    setIsCustomMode(false);
    onSelectModel(id);
  }

  function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || !customInput.trim()) return;
    onSelectModel(customInput.trim());
  }

  return (
    <div className="model-selector-container">
      <div className="model-selector-header">
        <label className="field-label">Select AI Inference Model</label>
        <span className="mono active-model-tag">Active: {selectedModel || 'None selected'}</span>
      </div>

      <div className="model-cards-grid">
        {PRESET_MODELS.map((opt) => {
          const isSelected = selectedModel === opt.id && !isCustomMode;
          const isEnabled = availableModels.length === 0 || availableModels.includes(opt.id);

          return (
            <div
              key={opt.id}
              className={`model-card ${isSelected ? 'model-card--selected' : ''} ${!isEnabled ? 'model-card--unsupported' : ''}`}
              onClick={() => handleSelect(opt.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleSelect(opt.id);
              }}
            >
              <div className="model-card__top">
                <span className="model-card__name font-bold">{opt.name}</span>
                <span className={`status-pill status-pill--${opt.badgeTone}`}>{opt.badge}</span>
              </div>
              <p className="model-card__desc">{opt.description}</p>
              <div className="model-card__specs">
                <span className="spec-item">⚡ {opt.speed}</span>
                <span className="spec-item">🪙 {opt.creditMultiplier}</span>
                <span className="spec-item">📦 {opt.contextWindow}</span>
              </div>
            </div>
          );
        })}

        {/* Custom / DePIN Model Option */}
        <div
          className={`model-card model-card--custom ${isCustomMode ? 'model-card--selected' : ''}`}
          onClick={() => {
            if (!disabled) {
              setIsCustomMode(true);
              if (customInput.trim()) onSelectModel(customInput.trim());
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="model-card__top">
            <span className="model-card__name font-bold">Custom Model / DePIN</span>
            <span className="status-pill status-pill--neutral">CUSTOM</span>
          </div>
          <p className="model-card__desc">
            Route requests to any custom DePIN cluster or upstream model identifier (e.g. Meta-Llama, Groq, Mistral).
          </p>
          {isCustomMode && (
            <form onSubmit={handleCustomSubmit} className="custom-model-form" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                placeholder="e.g. meta-llama/Meta-Llama-3-8B-Instruct"
                value={customInput}
                onChange={(e) => {
                  setCustomInput(e.target.value);
                  onSelectModel(e.target.value);
                }}
                disabled={disabled}
                className="custom-model-input"
              />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
