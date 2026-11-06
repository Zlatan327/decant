import { useEffect, useMemo, useState } from 'react';
import { MAX_REQUEST_BODY_BYTES } from '../domain/constants';
import { formatDuration, formatNumber, isFallbackModel } from '../domain/format';
import type { ApiResource, SessionRecord, StreamState } from '../domain/types';
import { targetAttributes } from './targets';

const supportedModels = [
  'gemini-3.8-flash',
  'meta-llama/Meta-Llama-3-8B-Instruct',
  'llama-3.3-70b-versatile',
  'claude-3-5-sonnet',
  'gpt-4o',
] as const;

const PROMPT_CHIPS = [
  { label: '⚡ Decant routing', prompt: 'Explain the advantage of Decant credit routing' },
  { label: '⚛ Quantum physics', prompt: 'Summarize the principles of quantum superposition and entanglement in simple terms' },
  { label: '🐍 Python quicksort', prompt: 'Write an idiomatic Python quicksort algorithm with comments' },
  { label: '📊 DePIN sentiment', prompt: 'Analyze the sentiment and future growth trajectory of decentralized compute networks' },
];

interface StreamViewerProps {
  sessions: ApiResource<SessionRecord[]>;
  selectedSessionId: string | null;
  stream: StreamState;
  now: number;
  initialModel?: string;
  onSelectSession: (sessionId: string) => void;
  onRun: (sessionId: string, model: string, prompt: string) => Promise<void>;
}

export function StreamViewer({ sessions, selectedSessionId, stream, now, initialModel, onSelectSession, onRun }: StreamViewerProps) {
  const [model, setModel] = useState<string>(initialModel && supportedModels.includes(initialModel as any) ? initialModel : supportedModels[0]);
  useEffect(() => {
    if (initialModel && supportedModels.includes(initialModel as any)) {
      setModel(initialModel);
    }
  }, [initialModel]);
  const [prompt, setPrompt] = useState('Explain the advantage of Decant credit routing');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const active = stream.status === 'requesting' || stream.status === 'streaming';
  const selected = sessions.data?.find((session) => session.sessionId === selectedSessionId) ?? null;
  const requestBytes = useMemo(() => new TextEncoder().encode(JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  })).byteLength, [model, prompt]);
  const blockedSession = !selected || selected.status !== 'active' || selected.remainingQuota <= 0;
  const actualModelLabel = stream.actualModel
    ? isFallbackModel(stream.actualModel)
      ? 'Gateway fallback · not Gemini'
      : stream.actualModel.toLowerCase().startsWith('gemini')
        ? 'Gemini response model'
        : 'Gateway response model'
    : 'Model reported after first chunk';
  const elapsed = stream.startedAt === null
    ? null
    : (stream.completedAt ?? now) - stream.startedAt;
  const receivedCharacters = Array.from(stream.text).length;
  const quotaHeaderText = stream.quotaAtResponse !== null
    ? `Response header ${formatNumber(stream.quotaAtResponse)} units (before settlement)`
    : stream.quotaHeaderReadable === false
      ? 'Quota header missing or not exposed by cross-origin CORS'
      : 'Quota response header —';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSessionId || !prompt.trim() || blockedSession || active || requestBytes > MAX_REQUEST_BODY_BYTES) return;
    await onRun(selectedSessionId, model, prompt.trim());
  }

  return (
    <section className="panel stream-panel" aria-labelledby="stream-heading" {...targetAttributes('live-stream-inspector', 'panel')}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Session-scoped request</p>
          <h2 id="stream-heading">Token stream</h2>
        </div>
        <span className={`status-pill status-pill--${active ? 'streaming' : stream.status === 'error' ? 'blocked' : stream.status === 'complete' ? 'healthy' : 'neutral'}`} data-status={stream.status} aria-live="polite">
          {active ? 'STREAMING' : stream.status.toUpperCase()}
        </span>
      </div>

      <form className="form-stack stream-form" onSubmit={submit} {...targetAttributes('chat-completion-form', 'panel')}>
        <label htmlFor="stream-session">Session</label>
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
              {session.sessionId} · {formatNumber(session.remainingQuota)} units
            </option>
          ))}
        </select>

        <label htmlFor="stream-model">Model requested</label>
        <select id="stream-model" value={model} onChange={(event) => setModel(event.target.value)} disabled={active} data-render-target="chat-model-select" data-motion-trigger="interaction">
          {supportedModels.map((modelName) => <option key={modelName} value={modelName}>{modelName}</option>)}
        </select>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="stream-prompt" style={{ margin: 0 }}>Prompt</label>
          <div className="prompt-suggestion-chips" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {PROMPT_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                className="pill-btn"
                style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px' }}
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
          rows={4}
          maxLength={3200}
          placeholder="Send a request through the selected DECANT session…"
          disabled={active}
          required
          data-render-target="chat-prompt-input"
          data-motion-trigger="interaction"
        />
        <div className="field-meta">
          <span>{formatNumber(requestBytes)} / {formatNumber(MAX_REQUEST_BODY_BYTES)} JSON body bytes</span>
          <span>{selected ? `${formatNumber(selected.remainingQuota)} quota units available` : 'Select a session'}</span>
        </div>

        <div className="action-row stream-form__actions">
          <button
            type="submit"
            className="button button--primary"
            disabled={!selectedSessionId || !prompt.trim() || blockedSession || active || requestBytes > MAX_REQUEST_BODY_BYTES}
            data-render-target="send-chat-completion"
            data-motion-trigger="interaction"
          >
            {active ? 'Request in progress…' : 'Send live request'}
          </button>
          <span className="field-note">A successful request consumes session quota and writes a ledger transaction.</span>
        </div>
        {requestBytes > MAX_REQUEST_BODY_BYTES && <p className="inline-error" role="alert">This request exceeds the gateway's configured payload limit.</p>}
        {blockedSession && <p className="resource-message resource-message--warning" role="status">Select an active session with available quota before sending. This console will not submit against a zero-balance session.</p>}
      </form>

      <details className="disclosure disclosure--compact" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}>
        <summary data-render-target="toggle-stream-security-note" data-motion-trigger="interaction">Request and key-handling scope</summary>
        <p className="field-note">This console sends the documented `X-Decant-Session` header only. Agent requests require `X-Decant-Public-Key`, `X-Decant-Signature`, and `X-Decant-Timestamp` when cryptographic verification is enabled; use the agent SDK for signed requests. This UI never requests or stores private keys. The Gemini key stays in the gateway. Global failures from other agents are not available without a gateway event endpoint.</p>
      </details>

      <div className="stream-output" {...targetAttributes('sse-token-output', 'status')}>
        <div className="stream-output__header">
          <span className="metric-label">Gateway response</span>
          {stream.actualModel && <span className={`source-badge ${isFallbackModel(stream.actualModel) ? 'source-badge--warning' : ''}`}>{actualModelLabel}</span>}
        </div>
        <pre className="stream-output__content" aria-label="Actual streamed response" aria-live="off">
          {stream.text || (stream.status === 'error' ? 'Request failed before response content was received.' : 'No response data received. The stream remains empty until the gateway sends bytes.')}
        </pre>
        <div className="stream-output__meta" aria-live="polite">
          <span>{stream.actualModel ? `Model ${stream.actualModel}` : 'Actual model —'}</span>
          <span>{formatNumber(receivedCharacters)} characters received</span>
          <span>{elapsed === null ? 'Round trip —' : `Round trip ${formatDuration(elapsed)}`}</span>
          <span>{quotaHeaderText}</span>
        </div>
        {stream.status === 'error' && (
          <p className={`stream-error${[401, 402, 403].includes(stream.httpStatus ?? 0) ? ' stream-error--blocked' : ''}`} role="alert" data-http-status={stream.httpStatus ?? undefined}>
            {stream.httpStatus !== null && <strong className="mono">HTTP {stream.httpStatus} · </strong>}
            {stream.error}
          </p>
        )}
      </div>
    </section>
  );
}
