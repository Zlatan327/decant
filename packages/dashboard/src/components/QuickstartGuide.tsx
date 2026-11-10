import { useState } from 'react';
import { HonestBadge } from './HonestBadge';

interface QuickstartGuideProps {
  sessions: Array<{ sessionId: string; remainingQuota: number; status: string }>;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onGoToInference: () => void;
  onGoToSessions: () => void;
}

export function QuickstartGuide({
  sessions,
  selectedSessionId,
  onSelectSession,
  onGoToInference,
  onGoToSessions,
}: QuickstartGuideProps) {
  const activeSession = sessions.find((s) => s.sessionId === selectedSessionId) ?? sessions[0];
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const curlSnippet = `curl -X POST "http://localhost:8080/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "X-Decant-Session: ${activeSession?.sessionId ?? 'your-session-id'}" \\
  -H "X-Decant-Timestamp: \$(date +%s%3N)" \\
  -H "X-Decant-Signature: <ed25519_signature>" \\
  -d '{"model":"gemini-3.8-flash","messages":[{"role":"user","content":"Verify protocol settlement"}],"stream":true}'`;

  const copyCurl = () => {
    navigator.clipboard.writeText(curlSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const hasSession = !!activeSession;
  const hasQuota = (activeSession?.remainingQuota ?? 0) > 0;

  return (
    <div
      className="panel quickstart-card"
      style={{
        padding: '24px',
        marginBottom: '24px',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Agent Quickstart Checklist</h2>
            <HonestBadge type="Testnet" />
            <HonestBadge type="Unverified" />
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
            Follow these 3 steps to establish agent identity, allocate credits, and stream verified compute in under 3 minutes.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '16px' }}>
        {/* Step 1 */}
        <div
          style={{
            padding: '16px',
            borderRadius: '6px',
            border: `1px solid ${hasSession ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.1)'}`,
            background: hasSession ? 'rgba(34, 197, 94, 0.04)' : 'rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: hasSession ? '#22c55e' : 'rgba(255,255,255,0.5)' }}>
              STEP 1 · AGENT KEYPAIR
            </span>
            {hasSession && <span style={{ color: '#22c55e', fontSize: '14px' }}>✓</span>}
          </div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Register Identity</h4>
          {hasSession ? (
            <div style={{ margin: '0 0 12px 0' }}>
              <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '4px' }}>
                Active Agent Session:
              </label>
              {sessions.length > 1 ? (
                <select
                  value={activeSession.sessionId}
                  onChange={(e) => onSelectSession(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '4px',
                    padding: '3px 6px',
                    fontSize: '11px',
                    width: '100%',
                  }}
                >
                  {sessions.map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {s.sessionId} ({s.remainingQuota.toLocaleString()} cr)
                    </option>
                  ))}
                </select>
              ) : (
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', margin: 0 }}>
                  <code className="mono">{activeSession.sessionId}</code>
                </p>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: '0 0 12px 0' }}>
              Generate an Ed25519 keypair and register with the gateway.
            </p>
          )}
          <button
            type="button"
            className={`button ${hasSession ? 'button--secondary' : 'button--primary'} button--small`}
            onClick={onGoToSessions}
          >
            {hasSession ? 'Manage keys' : 'Create session key'}
          </button>
        </div>

        {/* Step 2 */}
        <div
          style={{
            padding: '16px',
            borderRadius: '6px',
            border: `1px solid ${hasQuota ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255,255,255,0.1)'}`,
            background: hasQuota ? 'rgba(34, 197, 94, 0.04)' : 'rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: hasQuota ? '#22c55e' : 'rgba(255,255,255,0.5)' }}>
              STEP 2 · COMPUTE CREDITS
            </span>
            {hasQuota && <span style={{ color: '#22c55e', fontSize: '14px' }}>✓</span>}
          </div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Available Balance</h4>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: '0 0 12px 0' }}>
            {hasQuota ? (
              <><strong style={{ color: '#22c55e' }}>{activeSession.remainingQuota.toLocaleString()}</strong> credits allocated</>
            ) : (
              'Allocate testnet compute credits to reserve token ceilings.'
            )}
          </p>
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={onGoToSessions}
          >
            {hasQuota ? 'Top up balance' : 'Allocate credits'}
          </button>
        </div>

        {/* Step 3 */}
        <div
          style={{
            padding: '16px',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>
              STEP 3 · INFERENCE
            </span>
          </div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '14px' }}>Run & Settle</h4>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: '0 0 12px 0' }}>
            Test streaming with real Gemini token metering and 5-stage lifecycle.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="button button--primary button--small"
              onClick={onGoToInference}
            >
              Open Playground
            </button>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={copyCurl}
              title="Copy cURL snippet"
            >
              {copiedSnippet ? 'Copied!' : 'Copy cURL'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
