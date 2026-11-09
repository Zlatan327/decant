import { useState } from 'react';
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

export function StreamViewer({
  sessions, selectedSessionId, stream, now, initialModel, models = [], onSelectSession, onRun, onManageSessions,
}: StreamViewerProps) {
  const [modelChoice, setModelChoice] = useState(initialModel ?? '');
  const [prompt, setPrompt] = useState('');
  const [maxTokens, setMaxTokens] = useState("128");
  const [temperature, setTemperature] = useState("0.7");
  const [copyStatus, setCopyStatus] = useState('');
  const model = models.includes(modelChoice) ? modelChoice : models[0] ?? '';
  const active = stream.status === 'requesting' || stream.status === 'streaming';
  const selected = sessions.data?.find(session => session.sessionId === selectedSessionId);
  const requestBytes = new TextEncoder().encode(JSON.stringify({
    model, messages: [{ role: 'user', content: prompt.trim() }], stream: true,
    max_tokens: Number(maxTokens), temperature: Number(temperature),
  })).byteLength;
  const blocked = !selected ? 'Select a session to continue.'
    : selected.status !== 'active' || selected.remainingQuota <= 0 ? 'Choose an active session with available credits.'
    : !model ? 'No model is configured on the gateway.'
    : requestBytes > MAX_REQUEST_BODY_BYTES ? 'Shorten the prompt to fit the request limit.' : '';
  const elapsed = stream.startedAt === null ? null : (stream.completedAt ?? now) - stream.startedAt;

  return (
    <div className="request-layout">
      <section className="panel request-panel" aria-labelledby="stream-heading">
        <h2 id="stream-heading">New request</h2>
        <form className="request-form" onSubmit={event => {
          event.preventDefault();
          if (selected && !blocked && !active && prompt.trim()) {
            setCopyStatus('');
            void onRun(selected.sessionId, model, prompt.trim(), { maxTokens: Number(maxTokens), temperature: Number(temperature) });
          }
        }}>
          <div className="request-fields">
            <label htmlFor="stream-session">Session
              <select id="stream-session" value={selectedSessionId ?? ''} disabled={active}
                onChange={event => onSelectSession(event.target.value)}>
                <option value="">Select a session</option>
                {(sessions.data ?? []).map(session => (
                  <option key={session.sessionId} value={session.sessionId}>{session.sessionId}</option>
                ))}
              </select>
            </label>
            <label htmlFor="stream-model">Model
              <select id="stream-model" value={model} disabled={active || !models.length}
                onChange={event => setModelChoice(event.target.value)}>
                {!models.length && <option value="">No configured model</option>}
                {models.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
          </div>
          {selected && <p className="field-note">{formatNumber(selected.remainingQuota)} credits available</p>}
          {!sessions.data?.length && (
            <button type="button" className="button button--quiet request-session-link" onClick={onManageSessions}>Manage sessions</button>
          )}
          <label htmlFor="stream-prompt">Prompt
            <textarea id="stream-prompt" value={prompt} onChange={event => setPrompt(event.target.value)}
              rows={5} maxLength={3200} placeholder="Enter a prompt" disabled={active} required />
          </label>
          <details className="disclosure request-settings">
            <summary>Advanced settings</summary>
            <div className="request-fields">
              <label htmlFor="stream-max-tokens">Max output tokens
                <input id="stream-max-tokens" type="number" min={1} max={4096} value={maxTokens} required
                  disabled={active} onChange={event => setMaxTokens(event.target.value)} />
              </label>
              <label htmlFor="stream-temperature">Temperature
                <input id="stream-temperature" type="number" min={0} max={1} step={0.1} value={temperature} required
                  disabled={active} onChange={event => setTemperature(event.target.value)} />
              </label>
            </div>
          </details>
          <div className="action-row">
            <button type="submit" className="button button--primary" disabled={Boolean(blocked) || active || !prompt.trim()}>
              {active ? 'Running…' : 'Run request'}
            </button>
            {blocked && <span className="field-note" role="status">{blocked}</span>}
          </div>
        </form>
      </section>
      <section className="panel request-panel request-response" aria-labelledby="response-heading">
        <div className="panel-heading">
          <h2 id="response-heading">Response</h2>
          {stream.text && <button type="button" className="button button--quiet" onClick={async () => {
            try {
              await navigator.clipboard.writeText(stream.text);
              setCopyStatus('Copied');
            } catch {
              setCopyStatus('Copy failed');
            }
          }}>{copyStatus || 'Copy'}</button>}
        </div>
        {stream.text
          ? <pre className="request-response__text">{stream.text}</pre>
          : <p className="request-response__empty">{active ? 'Waiting for the model…' : 'Your response will appear here.'}</p>}
        <div role="status" className="field-note">
          {active ? 'Request in progress' : stream.status === 'complete' ? 'Request complete' : ''}
          {stream.actualModel && <span> · {stream.actualModel}</span>}
          {elapsed !== null && <span> · {formatDuration(elapsed)}</span>}
        </div>
        {stream.status === 'error' && <p className="inline-error" role="alert">
          {stream.httpStatus === 402 ? 'This session has insufficient credits. Ask an operator to add credits.'
            : stream.httpStatus === 401 || stream.httpStatus === 403 ? 'Check your operator access or session credentials.'
            : stream.error}
        </p>}
      </section>
    </div>
  );
}
