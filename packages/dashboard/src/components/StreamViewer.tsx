import { useEffect, useMemo, useState } from 'react';
import { MAX_REQUEST_BODY_BYTES } from '../domain/constants';
import { formatDuration, formatNumber, isFallbackModel } from '../domain/format';
import type { ApiResource, SessionRecord, StreamState } from '../domain/types';
import type { InferenceRunOptions } from '../hooks/useDashboardData';
import { ModelSelector } from './ModelSelector';
import { targetAttributes } from './targets';

const PROMPT_CHIPS = [
  { label: '⚡ Decant routing', prompt: 'Explain the advantage of Decant credit routing' },
  { label: '🛡️ Solidity contract', prompt: 'What makes a Solidity smart contract truly well-designed? Compare gas efficiency, modularity, and security.' },
  { label: '🦀 Rust NEAR quotas', prompt: 'Explain how NEAR storage staking and compute unit metering prevent state bloat in Rust contracts' },
  { label: '📊 DePIN economics', prompt: 'Analyze the economic incentive model of decentralized physical infrastructure networks (DePIN)' },
  { label: '🐍 Python quicksort', prompt: 'Write an idiomatic, in-place Python quicksort algorithm with time complexity annotations' },
];

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
  latencyMs?: number;
  costUnits?: number;
}

interface StreamViewerProps {
  sessions: ApiResource<SessionRecord[]>;
  selectedSessionId: string | null;
  stream: StreamState;
  now: number;
  initialModel?: string;
  models?: string[];
  onSelectSession: (sessionId: string) => void;
  onRun: (sessionId: string, model: string, prompt: string, options?: InferenceRunOptions) => Promise<void>;
  onNavigateToShop?: () => void;
  onRefreshSessions?: () => void;
}

export function StreamViewer({
  sessions,
  selectedSessionId,
  stream,
  now,
  initialModel,
  models: supportedModels = [],
  onSelectSession,
  onRun,
  onNavigateToShop,
  onRefreshSessions,
}: StreamViewerProps) {
  const [lastCostUnits, setLastCostUnits] = useState<number | null>(null);
  const DEFAULT_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'meta-llama/Meta-Llama-3-8B-Instruct'];
  const effectiveModels = supportedModels.length > 0 ? supportedModels : DEFAULT_MODELS;

  const [model, setModel] = useState<string>(initialModel || effectiveModels[0] || 'gemini-3.5-flash');

  useEffect(() => {
    if (initialModel) {
      setModel(initialModel);
    }
  }, [initialModel]);

  const [prompt, setPrompt] = useState('Explain the advantage of Decant credit routing');
  const [maxTokens, setMaxTokens] = useState<number>(128);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const active = stream.status === 'requesting' || stream.status === 'streaming';
  const selected = sessions.data?.find((session) => session.sessionId === selectedSessionId) ?? null;

  // Track conversation messages
  useEffect(() => {
    if (stream.status === 'complete' && stream.text) {
      const estimatedUnits = Math.ceil(Array.from(stream.text).length / 4);
      setLastCostUnits(estimatedUnits);
      setHistory((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: stream.text,
          timestamp: Date.now(),
          model: stream.actualModel || model,
          latencyMs: stream.startedAt ? (stream.completedAt ?? Date.now()) - stream.startedAt : undefined,
          costUnits: estimatedUnits,
        },
      ]);
      onRefreshSessions?.();
    }
  }, [stream.status, stream.completedAt]);

  const requestBytes = useMemo(
    () =>
      new TextEncoder().encode(
        JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
          max_tokens: maxTokens,
          temperature,
        })
      ).byteLength,
    [model, prompt, maxTokens, temperature]
  );

  const blockedSession = !model || !selected || selected.status !== 'active' || selected.remainingQuota <= 0;

  const actualModelLabel = stream.actualModel
    ? isFallbackModel(stream.actualModel)
      ? 'Gateway fallback · not Gemini'
      : stream.actualModel.toLowerCase().startsWith('gemini')
        ? `Gemini (${stream.actualModel})`
        : `Gateway (${stream.actualModel})`
    : `Auto-Selected: ${model || 'gemini-3.5-flash'}`;

  const elapsed =
    stream.startedAt === null ? null : (stream.completedAt ?? now) - stream.startedAt;
  const receivedCharacters = Array.from(stream.text).length;
  const estimatedTokens = Math.ceil(receivedCharacters / 4);
  const tokensPerSec = elapsed && elapsed > 0 ? ((estimatedTokens / elapsed) * 1000).toFixed(1) : null;

  const quotaHeaderText =
    stream.quotaAtResponse !== null
      ? `Remaining quota: ${formatNumber(stream.quotaAtResponse)} units`
      : stream.quotaHeaderReadable === false
        ? 'Quota header missing or not exposed'
        : 'Quota response header —';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSessionId || !prompt.trim() || blockedSession || active || requestBytes > MAX_REQUEST_BODY_BYTES) return;

    const currentPrompt = prompt.trim();
    // Add user message to history
    setHistory((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: currentPrompt,
        timestamp: Date.now(),
      },
    ]);

    await onRun(selectedSessionId, model, currentPrompt, {
      maxTokens,
      temperature,
    });
  }

  function handleCopy(text: string) {
    void navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }

  function handleClearChat() {
    setHistory([]);
  }

  return (
    <section className="panel stream-panel" aria-labelledby="stream-heading" {...targetAttributes('live-stream-inspector', 'panel')}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Session-scoped live compute</p>
          <h2 id="stream-heading">AI Inference Playground</h2>
        </div>
        <div className="panel-heading__actions">
          {history.length > 0 && (
            <button type="button" className="button button--quiet btn-sm" onClick={handleClearChat}>
              Clear Thread
            </button>
          )}
          <span
            className={`status-pill status-pill--${active ? 'streaming' : stream.status === 'error' ? 'blocked' : stream.status === 'complete' ? 'healthy' : 'neutral'}`}
            data-status={stream.status}
            aria-live="polite"
          >
            {active ? 'STREAMING' : stream.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Model Selection Component */}
      <ModelSelector
        selectedModel={model}
        onSelectModel={setModel}
        disabled={active}
        availableModels={supportedModels}
      />

      {/* Real-Time Continuous Metering & Balance Bar */}
      {selected && (
        <div className="continuous-meter-bar">
          <div className="continuous-meter-info">
            <span className="metric-label">Session Balance:</span>
            <span className="continuous-balance">
              {formatNumber(selected.remainingQuota)} Units
            </span>
            <span className="continuous-burn-tag">
              ⚡ Metered burn: ~1 unit per 4 characters
            </span>
            {lastCostUnits !== null && (
              <span className="continuous-burn-tag" style={{ color: 'var(--near-green)' }}>
                Last query: -{lastCostUnits} units
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onNavigateToShop && (
              <button
                type="button"
                className="button button--secondary btn-sm"
                onClick={onNavigateToShop}
              >
                🛍️ Buy Package
              </button>
            )}
          </div>
        </div>
      )}

      <form className="form-stack stream-form" onSubmit={submit} {...targetAttributes('chat-completion-form', 'panel')}>
        {/* Session Selection */}
        <div className="form-group">
          <label htmlFor="stream-session">Active Agent Session</label>
          <select
            id="stream-session"
            value={selectedSessionId ?? ''}
            onChange={(event) => onSelectSession(event.target.value)}
            required
            data-render-target="chat-session-select"
            data-motion-trigger="interaction"
          >
            <option value="" disabled>Select a registered session</option>
            {(sessions.data ?? []).map((session) => (
              <option key={session.sessionId} value={session.sessionId}>
                {session.sessionId} · {formatNumber(session.remainingQuota)} units ({session.status})
              </option>
            ))}
          </select>
        </div>

        {/* Inference Controls Disclosure */}
        <div className="inference-controls-row">
          <div className="slider-control">
            <div className="slider-label">
              <span>Max Tokens: <strong>{maxTokens}</strong></span>
              <span className="field-note">Quota reserved: ~{maxTokens} units</span>
            </div>
            <input
              type="range"
              min={32}
              max={1024}
              step={32}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              disabled={active}
            />
          </div>

          <div className="slider-control">
            <div className="slider-label">
              <span>Temperature: <strong>{temperature}</strong></span>
              <span className="field-note">{temperature < 0.3 ? 'Deterministic' : temperature > 0.8 ? 'Creative' : 'Balanced'}</span>
            </div>
            <input
              type="range"
              min={0.0}
              max={1.0}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              disabled={active}
            />
          </div>
        </div>

        {/* Prompt Input & Suggestion Chips */}
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label htmlFor="stream-prompt" style={{ margin: 0 }}>Prompt</label>
            <div className="prompt-suggestion-chips" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  className="pill-btn"
                  onClick={() => setPrompt(chip.prompt)}
                  disabled={active}
                  title={`Use prompt: "${chip.prompt}"`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            id="stream-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            maxLength={3200}
            placeholder="Send a compute request through the selected Decant session…"
            disabled={active}
            required
            data-render-target="chat-prompt-input"
            data-motion-trigger="interaction"
          />
          <div className="field-meta">
            <span>{formatNumber(requestBytes)} / {formatNumber(MAX_REQUEST_BODY_BYTES)} JSON body bytes</span>
            <span>{selected ? `${formatNumber(selected.remainingQuota)} quota units available` : 'Select a session'}</span>
          </div>
        </div>

        <div className="action-row stream-form__actions">
          <button
            type="submit"
            className="button button--primary"
            disabled={!selectedSessionId || !prompt.trim() || blockedSession || active || requestBytes > MAX_REQUEST_BODY_BYTES}
            data-render-target="send-chat-completion"
            data-motion-trigger="interaction"
          >
            {active ? 'Streaming tokens…' : 'Stream Live Request'}
          </button>
          <span className="field-note">Atomic credit deduction occurs upon completion confirmation.</span>
        </div>

        {requestBytes > MAX_REQUEST_BODY_BYTES && (
          <p className="inline-error" role="alert">This request exceeds the gateway payload limit.</p>
        )}
        {blockedSession && (
          <p className="resource-message resource-message--warning" role="status">
            Select an active session with available quota before sending. Decant will not submit against exhausted balances.
          </p>
        )}
      </form>

      {/* Conversation Thread History */}
      {history.length > 0 && (
        <div className="chat-thread">
          <div className="chat-thread__header">
            <span className="metric-label">Thread History ({history.length} messages)</span>
          </div>
          <div className="chat-thread__messages">
            {history.map((msg) => (
              <div key={msg.id} className={`chat-bubble chat-bubble--${msg.role}`}>
                <div className="chat-bubble__meta">
                  <span className="chat-bubble__author">
                    {msg.role === 'user' ? '🧑 You' : `🤖 ${msg.model || 'Assistant'}`}
                  </span>
                  {msg.costUnits !== undefined && (
                    <span className="spec-badge" style={{ color: 'var(--near-green)', fontSize: '0.74rem' }}>
                      ⚡ -{msg.costUnits} units
                    </span>
                  )}
                  {msg.latencyMs && <span className="mono">{msg.latencyMs}ms</span>}
                  <button
                    type="button"
                    className="copy-bubble-btn"
                    onClick={() => handleCopy(msg.content)}
                    title="Copy message"
                  >
                    Copy
                  </button>
                </div>
                <div className="chat-bubble__content">
                  {msg.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Stream Terminal Box */}
      <div className="stream-output" {...targetAttributes('sse-token-output', 'status')}>
        <div className="stream-output__header">
          <div className="stream-output__title">
            <span className="metric-label">Live Gateway Response</span>
            {active && <span className="streaming-cursor">▊</span>}
          </div>
          <div className="stream-output__badges">
            {stream.text && (
              <button
                type="button"
                className="pill-btn"
                onClick={() => handleCopy(stream.text)}
              >
                {copyFeedback ? '✔ Copied' : 'Copy Response'}
              </button>
            )}
            <span className={`source-badge ${stream.actualModel && isFallbackModel(stream.actualModel) ? 'source-badge--warning' : ''}`}>
              {actualModelLabel}
            </span>
          </div>
        </div>

        <pre className="stream-output__content mono" aria-label="Actual streamed response" aria-live="off">
          {stream.text || (stream.status === 'error' ? 'Request failed before response content was received.' : 'Awaiting streaming response… Output renders progressively as tokens arrive from the provider.')}
        </pre>

        {/* Telemetry Strip */}
        <div className="stream-output__meta" aria-live="polite">
          <span>Active Model: <strong className="mono">{stream.actualModel || model || 'gemini-3.5-flash'}</strong></span>
          <span>{formatNumber(receivedCharacters)} chars (~{estimatedTokens} units)</span>
          <span>{elapsed === null ? 'Latency: —' : `Latency: ${formatDuration(elapsed)}`}</span>
          {tokensPerSec && <span>Speed: {tokensPerSec} t/s</span>}
          <span>{quotaHeaderText}</span>
        </div>

        {stream.status === 'error' && (
          <p
            className={`stream-error${[401, 402, 403].includes(stream.httpStatus ?? 0) ? ' stream-error--blocked' : ''}`}
            role="alert"
            data-http-status={stream.httpStatus ?? undefined}
          >
            {stream.httpStatus !== null && <strong className="mono">HTTP {stream.httpStatus} · </strong>}
            {stream.error}
          </p>
        )}
      </div>

      <details className="disclosure disclosure--compact" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}>
        <summary data-render-target="toggle-stream-security-note" data-motion-trigger="interaction">
          Request, Cryptographic Signatures & Security Architecture
        </summary>
        <p className="field-note">
          This console communicates with the Decant Gateway via signed requests and authenticated sessions. Tokens are metered atomically and settled in persistent SQLite WAL mode. Credit balances are stored in the local gateway ledger.
        </p>
      </details>
    </section>
  );
}
