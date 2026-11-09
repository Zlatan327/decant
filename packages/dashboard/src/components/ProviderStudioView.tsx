import { useCallback, useEffect, useState } from 'react';
import { errorMessage, requestJson } from '../api/client';

interface Provider {
  solverId: string;
  endpointUrl: string;
  modelsSupported: string[];
  isActive: boolean;
}

export function ProviderStudioView({ canManage, onSuccessNotice }: {
  canManage: boolean;
  onSuccessNotice?: () => void;
}) {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const result = await requestJson('/v1/solvers') as { solvers: Provider[] };
    setProviders(result.solvers);
  }, []);

  useEffect(() => {
    void refresh().catch(failure => setError(errorMessage(failure)));
  }, [refresh]);

  async function update(path: string, body?: object) {
    setBusy(true);
    setError('');
    try {
      await requestJson(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      await refresh();
      onSuccessNotice?.();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel provider-registry">
      <h2>Provider registry</h2>
      <p className="field-note">These entries describe providers. Request routing and payouts are pending.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {!providers && !error && <p role="status">Loading providers…</p>}
      {providers?.length === 0 && <p>No providers registered yet.</p>}
      {!!providers?.length && (
        <ul className="registry-list">
          {providers.map(provider => (
            <li key={provider.solverId}>
              <div>
                <strong>{provider.solverId}</strong>
                <p className="field-note">{provider.endpointUrl}</p>
                <p className="field-note">{provider.modelsSupported.join(', ')}</p>
              </div>
              <div className="action-row">
                <span>{provider.isActive ? 'Enabled in registry' : 'Paused'}</span>
                {canManage && <button type="button" className="button button--quiet" disabled={busy}
                  onClick={() => void update(`/v1/solvers/${encodeURIComponent(provider.solverId)}/toggle`)}>
                  {provider.isActive ? 'Pause' : 'Enable'}
                </button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <details className="disclosure">
          <summary>Register a provider</summary>
          <form className="request-form" onSubmit={event => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const modelsSupported = String(data.get('models')).split(',').map(model => model.trim()).filter(Boolean);
            if (!modelsSupported.length) {
              setError('Enter at least one model ID.');
              return;
            }
            void update('/v1/solvers/register', {
              solverId: String(data.get('solverId')).trim(),
              endpointUrl: String(data.get('endpoint')).trim(),
              modelsSupported,
            });
          }}>
            <label>Provider ID<input name="solverId" required /></label>
            <label>Endpoint URL<input name="endpoint" type="url" required /></label>
            <label>Model IDs<input name="models" required placeholder="Separate model IDs with commas" /></label>
            <button className="button button--primary" disabled={busy}>Save provider</button>
          </form>
        </details>
      ) : <p className="field-note">Operator access is required to manage providers.</p>}
    </section>
  );
}
