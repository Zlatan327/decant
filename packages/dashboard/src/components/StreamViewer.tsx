import { useState, useMemo } from 'react';
import { MAX_REQUEST_BODY_BYTES } from '../domain/constants';
import { formatDuration, formatNumber } from '../domain/format';
import type { ApiResource, SessionRecord, StreamState } from '../domain/types';
import type { InferenceRunOptions } from '../hooks/useDashboardData';

interface StreamViewerProps {
  sessions: ApiResource<SessionRecord[]>;
  selectedSessionId: string | null;
  stream: StreamState;
  now: number;
  initialModel?: string;
  models?: string[];
  onSelectSession: (sessionId: string) => void;
  onRun: (sessionId: string, model: string, prompt: string, options?: InferenceRunOptions) => Promise<void>;
  onManageSessions: () => void;
}

const PROMPT_CHIPS = [
  { label: '⚡ Decant Routing', prompt: 'Explain the core advantage of Decant credit routing for autonomous AI agents' },
  { label: '🛡️ NEAR Smart Contract', prompt: 'How does the Rust NEAR contract enforce idempotent settlement and session quotas?' },
  { label: '🧠 Structured Reasoning', prompt: 'Analyze autonomous agent compute volatility and summarize 3 mitigations in bullet points' },
];

export function StreamViewer({
  sessions, selectedSessionId, stream, now, initialModel, models = [], onSelectSession, onRun, onManageSessions,
}: StreamViewerProps) {
  const [modelChoice, setModelChoice] = useState(initialModel ?? '');
  const [prompt, setPrompt] = useState('Explain the core advantage of Decant credit routing for autonomous AI agents');
  const [maxTokens, setMaxTokens] = useState("128");
  const [temperature, setTemperature] = useState("0.7");
  const [copyStatus, setCopyStatus] = useState('');
  const [activeSnippetTab, setActiveSnippetTab] = useState<'none' | 'curl' | 'sdk'>('none');

  const model = models.includes(modelChoice) ? modelChoice : models[0] ?? '';
  const active = stream.status === 'requesting' || stream.status === 'streaming';
  const selected = sessions.data?.find(session => session.sessionId === selectedSessionId);

  const estimatedPromptUnits = Math.ceil(prompt.trim().length / 4);
  const ceilingReservation = estimatedPromptUnits + (Number(maxTokens) || 128);

  const requestBytes = new TextEncoder().encode(JSON.stringify({
    model, messages: [{ role: 'user', content: prompt.trim() }], stream: true,
    max_tokens: Number(maxTokens), temperature: Number(temperature),
  })).byteLength;

  const blocked = !selected ? 'Select a session to continue.'
    : selected.status !== 'active' || selected.remainingQuota <= 0 ? 'Choose an active session with available credits.'
    : selected.remainingQuota < ceilingReservation ? `Insufficient credits: need ${ceilingReservation} ceiling, have ${selected.remainingQuota}.`
    : !model ? 'No model is configured on the gateway.'
    : requestBytes > MAX_REQUEST_BODY_BYTES ? 'Shorten the prompt to fit the request limit.' : '';

  const elapsed = stream.startedAt === null ? null : (stream.completedAt ?? now) - stream.startedAt;

  // Calculate actual observed usage upon completion
  const observedCompletionUnits = useMemo(() => {
    if (!stream.text) return 0;
    return Math.ceil(stream.text.length / 4);
  }, [stream.text]);

  const totalUsedUnits = estimatedPromptUnits + observedCompletionUnits;
  const refundedUnits = Math.max(0, ceilingReservation - totalUsedUnits);

  const curlSnippet = `curl -X POST http://127.0.0.1:8080/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "X-Decant-Session: ${selectedSessionId || '<SESSION_ID>'}" \\
  -d '{
    "model": "${model}",
    "messages": [{"role": "user", "content": "${prompt.replace(/"/g, '\\"').slice(0, 60)}..."}],
    "max_tokens": ${maxTokens},
    "stream": true
  }'`;

  const sdkSnippet = `import { DecantClient } from "@decant/agent-sdk";

const client = new DecantClient({
  gatewayUrl: "http://127.0.0.1:8080",
  sessionId: "${selectedSessionId || '<SESSION_ID>'}",
  maxOutputUnits: ${maxTokens},
});

const response = await client.streamChat(
  "${prompt.replace(/"/g, '\\"').slice(0, 50)}...",
  (token) => process.stdout.write(token)
);`;

  return (
    <div className="request-layout">
      {/* ── Left Column: Configuration & Prompt ── */}
      <section className="panel request-panel" aria-labelledby="stream-heading">
        <div className="panel-heading">
          <h2 id="stream-heading">Run Inference</h2>
          <span className="connection-chip" title="Pre-reserved ceiling deduction">
            Ceiling: <strong>{ceilingReservation} units</strong>
          </span>
        </div>

        <form className="request-form" onSubmit={event => {
          event.preventDefault();
          if (selected && !blocked && !active && prompt.trim()) {
            setCopyStatus('');
            void onRun(selected.sessionId, model, prompt.trim(), { maxTokens: Number(maxTokens), temperature: Number(temperature) });
          }
        }}>
          <div className="request-fields">
            <label htmlFor="stream-session">Session Key
              <select id="stream-session" value={selectedSessionId ?? ''} disabled={active}
                onChange={event => onSelectSession(event.target.value)}>
                <option value="">Select a session</option>
                {(sessions.data ?? []).map(session => (
                  <option key={session.sessionId} value={session.sessionId}>
                    {session.sessionId} ({formatNumber(session.remainingQuota)} units)
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="stream-model">Inference Model
              <select id="stream-model" value={model} disabled={active || !models.length}
                onChange={event => setModelChoice(event.target.value)}>
                {!models.length && <option value="">No configured model</option>}
                {models.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
          </div>

          {selected && (
            <p className="field-note">
              Quota balance: <strong>{formatNumber(selected.remainingQuota)}</strong> credits available
              {selected.remainingQuota < ceilingReservation && (
                <span style={{ color: 'var(--console-accent)', marginLeft: '8px' }}>
                  (Add quota to meet {ceilingReservation} ceiling)
                </span>
              )}
            </p>
          )}

          {!sessions.data?.length && (
            <button type="button" className="button button--quiet request-session-link" onClick={onManageSessions}>
              Manage sessions
            </button>
          )}

          {/* Prompt Preset Chips */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '8px 0' }}>
            {PROMPT_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className="button button--quiet"
                style={{ fontSize: '12px', padding: '4px 10px', height: 'auto', borderRadius: '16px' }}
                disabled={active}
                onClick={() => setPrompt(chip.prompt)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <label htmlFor="stream-prompt">Prompt
            <textarea id="stream-prompt" value={prompt} onChange={event => setPrompt(event.target.value)}
              rows={4} maxLength={8000} placeholder="Enter your prompt here..." disabled={active} required />
          </label>

          <details className="disclosure request-settings">
            <summary>Advanced Generation Parameters</summary>
            <div className="request-fields">
              <label htmlFor="stream-max-tokens">Max Output Ceiling (Tokens)
                <input id="stream-max-tokens" type="number" min={1} max={4096} value={maxTokens} required
                  disabled={active} onChange={event => setMaxTokens(event.target.value)} />
              </label>
              <label htmlFor="stream-temperature">Temperature
                <input id="stream-temperature" type="number" min={0} max={1} step={0.1} value={temperature} required
                  disabled={active} onChange={event => setTemperature(event.target.value)} />
              </label>
            </div>
          </details>

          <div className="action-row" style={{ marginTop: '12px', alignItems: 'center' }}>
            <button type="submit" className="button button--primary" disabled={Boolean(blocked) || active || !prompt.trim()}>
              {active ? 'Streaming…' : 'Stream Request'}
            </button>

            <button
              type="button"
              className="button button--quiet"
              onClick={() => setActiveSnippetTab(prev => prev === 'curl' ? 'none' : 'curl')}
            >
              Copy as cURL
            </button>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setActiveSnippetTab(prev => prev === 'sdk' ? 'none' : 'sdk')}
            >
              Agent SDK
            </button>

            {blocked && <span className="field-note" role="status" style={{ color: '#e88' }}>{blocked}</span>}
          </div>

          {activeSnippetTab !== 'none' && (
            <div style={{ marginTop: '12px', background: 'var(--console-inset)', padding: '12px', borderRadius: '6px', border: 'var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span className="metric-label">{activeSnippetTab === 'curl' ? 'cURL Command' : 'TypeScript SDK'}</span>
                <button
                  type="button"
                  className="button button--quiet"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={async () => {
                    const text = activeSnippetTab === 'curl' ? curlSnippet : sdkSnippet;
                    await navigator.clipboard.writeText(text);
                    setCopyStatus('Snippet copied');
                    setTimeout(() => setCopyStatus(''), 2000);
                  }}
                >
                  {copyStatus || 'Copy Code'}
                </button>
              </div>
              <pre style={{ margin: 0, fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                {activeSnippetTab === 'curl' ? curlSnippet : sdkSnippet}
              </pre>
            </div>
          )}
        </form>
      </section>

      {/* ── Right Column: 5-Stage Lifecycle & Live Stream ── */}
      <section className="panel request-panel request-response" aria-labelledby="response-heading">
        <div className="panel-heading">
          <h2 id="response-heading">Streaming Telemetry</h2>
          {stream.text && (
            <button type="button" className="button button--quiet" onClick={async () => {
              try {
                await navigator.clipboard.writeText(stream.text);
                setCopyStatus('Copied');
                setTimeout(() => setCopyStatus(''), 2000);
              } catch {
                setCopyStatus('Copy failed');
              }
            }}>
              {copyStatus || 'Copy Output'}
            </button>
          )}
        </div>

        {/* 5-Stage Lifecycle Status Indicator */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '4px',
          padding: '10px 8px',
          background: 'var(--console-inset)',
          borderRadius: '8px',
          marginBottom: '12px',
          border: 'var(--border)',
          textAlign: 'center',
          fontSize: '11px',
        }}>
          <div style={{ color: selected ? 'var(--console-accent)' : 'var(--muted)' }}>
            <strong>1. Signed</strong>
            <div style={{ fontSize: '10px' }}>Ed25519</div>
          </div>
          <div style={{ color: active || stream.status === 'complete' ? 'var(--console-accent)' : 'var(--muted)' }}>
            <strong>2. Reserved</strong>
            <div style={{ fontSize: '10px' }}>{ceilingReservation}u ceiling</div>
          </div>
          <div style={{ color: active ? 'var(--console-accent)' : stream.status === 'complete' ? 'var(--muted)' : 'var(--muted)' }}>
            <strong>3. Streaming</strong>
            <div style={{ fontSize: '10px' }}>{elapsed ? `${formatDuration(elapsed)}` : 'zero-buffer'}</div>
          </div>
          <div style={{ color: stream.status === 'complete' ? 'var(--console-accent)' : 'var(--muted)' }}>
            <strong>4. Settled</strong>
            <div style={{ fontSize: '10px' }}>{stream.status === 'complete' ? `${totalUsedUnits}u debited` : 'atomic'}</div>
          </div>
          <div style={{ color: stream.httpStatus === 402 ? '#f88' : 'var(--muted)' }}>
            <strong>5. Breaker</strong>
            <div style={{ fontSize: '10px' }}>HTTP 402</div>
          </div>
        </div>

        {/* Settled Settlement Breakdown Bar */}
        {stream.status === 'complete' && (
          <div style={{
            background: 'var(--console-inset)',
            padding: '10px 14px',
            borderRadius: '6px',
            marginBottom: '12px',
            border: 'var(--border)',
            fontSize: '13px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>Settled Debit: <strong style={{ color: 'var(--console-accent)' }}>{totalUsedUnits} units</strong></span>
              <span>Refunded Unused: <strong style={{ color: '#8de6bb' }}>{refundedUnits} units</strong></span>
            </div>
            {/* Visual Bar */}
            <div style={{ height: '8px', background: '#334840', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${Math.min(100, (totalUsedUnits / ceilingReservation) * 100)}%`, background: 'var(--console-accent)' }} />
              <div style={{ width: `${Math.min(100, (refundedUnits / ceilingReservation) * 100)}%`, background: '#4d8a70' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
              <span>Prompt: ~{estimatedPromptUnits}u · Output: ~{observedCompletionUnits}u</span>
              <span>Ceiling: {ceilingReservation}u</span>
            </div>
          </div>
        )}

        {/* Streamed Output Window */}
        {stream.text
          ? <pre className="request-response__text" style={{ minHeight: '160px', maxHeight: '360px', overflowY: 'auto' }}>{stream.text}</pre>
          : <p className="request-response__empty">{active ? 'Receiving SSE token chunks from model…' : 'Your response will stream here in real time.'}</p>}

        <div role="status" className="field-note" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
          <span>
            {active ? '⚡ Streaming active' : stream.status === 'complete' ? '✔ Request complete' : 'Ready'}
            {stream.actualModel && <span> · {stream.actualModel}</span>}
          </span>
          {elapsed !== null && <span>Elapsed: {formatDuration(elapsed)}</span>}
        </div>

        {stream.status === 'error' && (
          <p className="inline-error" role="alert" style={{ marginTop: '8px' }}>
            {stream.httpStatus === 402 ? 'Insufficient compute credits. Add quota to this session in the Sessions tab.'
              : stream.httpStatus === 401 || stream.httpStatus === 403 ? 'Session verification failed. Check signature credentials or operator key.'
              : stream.error}
          </p>
        )}
      </section>
    </div>
  );
}
