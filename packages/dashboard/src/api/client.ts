import type {
  GatewayHealth,
  IntentRecord,
  IntentStatus,
  RegisterSessionInput,
  SessionDetail,
  SessionRecord,
  SessionStatus,
  TransactionRecord,
} from '../domain/types';

const configuredBase = (import.meta.env.VITE_DECANT_API_BASE_URL ?? '').trim();
export const gatewayApiBase = configuredBase.replace(/\/+$/, '');

export function gatewayTargetLabel(): string {
  return gatewayApiBase ? gatewayApiBase : 'same-origin /v1 route';
}

export function gatewayUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${gatewayApiBase}${normalizedPath}`;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.path = path;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSessionRecord(value: unknown): value is SessionRecord {
  if (!isRecord(value)) return false;
  const statuses: SessionStatus[] = ['active', 'exhausted', 'suspended'];
  return isNonEmptyString(value.sessionId)
    && isNonEmptyString(value.publicKey)
    && typeof value.ownerAccountId === 'string'
    && isFiniteNumber(value.totalQuota)
    && isFiniteNumber(value.remainingQuota)
    && isFiniteNumber(value.createdAt)
    && typeof value.status === 'string'
    && statuses.includes(value.status as SessionStatus);
}

function isIntentRecord(value: unknown): value is IntentRecord {
  if (!isRecord(value)) return false;
  const statuses: IntentStatus[] = ['open', 'filled', 'settled', 'expired'];
  return isNonEmptyString(value.intentId)
    && isNonEmptyString(value.sessionId)
    && isNonEmptyString(value.model)
    && isFiniteNumber(value.maxBudget)
    && typeof value.status === 'string'
    && statuses.includes(value.status as IntentStatus)
    && (value.solverId === null || typeof value.solverId === 'string')
    && isFiniteNumber(value.createdAt)
    && (value.filledAt === null || isFiniteNumber(value.filledAt));
}

function isTransactionRecord(value: unknown): value is TransactionRecord {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.txId)
    && isNonEmptyString(value.sessionId)
    && isFiniteNumber(value.promptTokens)
    && isFiniteNumber(value.completionTokens)
    && isFiniteNumber(value.costUnits)
    && isNonEmptyString(value.model)
    && isFiniteNumber(value.upstreamLatencyMs)
    && isFiniteNumber(value.timestamp);
}

export async function parseApiError(response: Response, path: string): Promise<ApiRequestError> {
  let message = `${response.status} ${response.statusText || 'Gateway request failed'}`;
  try {
    const body: unknown = await response.json();
    if (isRecord(body)) {
      const candidate = body.error ?? body.message ?? body.detail;
      if (typeof candidate === 'string' && candidate.trim()) message = candidate.trim();
    }
  } catch {
    // The gateway may return an empty or non-JSON error body.
  }
  return new ApiRequestError(response.status, path, message);
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(gatewayUrl(path), {
      ...init,
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network connection failed.';
    throw new ApiRequestError(0, path, message);
  }

  if (!response.ok) throw await parseApiError(response, path);
  try {
    return await response.json() as unknown;
  } catch {
    throw new ApiRequestError(response.status, path, 'Gateway returned invalid JSON.');
  }
}

function requireRecord<T>(payload: unknown, path: string, guard: (value: unknown) => value is T, description: string): T {
  if (!guard(payload)) throw new ApiRequestError(502, path, `Gateway response did not match the ${description} shape.`);
  return payload;
}

function readArray<T>(payload: unknown, key: string, path: string, guard: (value: unknown) => value is T): T[] {
  if (!isRecord(payload) || !Array.isArray(payload[key])) {
    throw new ApiRequestError(502, path, `Gateway response did not contain an array named '${key}'.`);
  }
  const values = payload[key];
  if (!values.every(guard)) {
    throw new ApiRequestError(502, path, `Gateway response contained an invalid record in '${key}'.`);
  }
  return values;
}

export async function getHealth(): Promise<GatewayHealth> {
  const path = '/v1/health';
  const payload: unknown = await requestJson(path);
  if (!isRecord(payload)
    || typeof payload.status !== 'string'
    || typeof payload.ledger !== 'string'
    || typeof payload.nearSync !== 'string'
    || !isFiniteNumber(payload.uptime)
    || (payload.timestamp !== undefined && !isFiniteNumber(payload.timestamp))) {
    throw new ApiRequestError(502, path, 'Gateway health response did not match the documented shape.');
  }
  return payload as unknown as GatewayHealth;
}

export async function listSessions(): Promise<SessionRecord[]> {
  const path = '/v1/sessions';
  return readArray(await requestJson(path), 'sessions', path, isSessionRecord);
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  const path = `/v1/sessions/${encodeURIComponent(sessionId)}`;
  const payload: unknown = await requestJson(path);
  if (!isRecord(payload) || !isSessionRecord(payload.session) || !Array.isArray(payload.transactions) || !payload.transactions.every(isTransactionRecord)) {
    throw new ApiRequestError(502, path, 'Session detail response did not match the documented session and transaction shape.');
  }
  return payload as unknown as SessionDetail;
}

export async function registerSession(input: RegisterSessionInput): Promise<SessionRecord> {
  const path = '/v1/sessions/register';
  const payload = await requestJson(path, { method: 'POST', body: JSON.stringify(input) });
  return requireRecord(payload, path, isSessionRecord, 'session');
}

export async function topUpSession(sessionId: string, amount: number): Promise<SessionRecord> {
  const path = `/v1/sessions/${encodeURIComponent(sessionId)}/topup`;
  const payload = await requestJson(path, { method: 'POST', body: JSON.stringify({ amount }) });
  return requireRecord(payload, path, isSessionRecord, 'session');
}

export async function listIntents(): Promise<IntentRecord[]> {
  const path = '/v1/intents';
  return readArray(await requestJson(path), 'intents', path, isIntentRecord);
}

export async function broadcastIntent(input: {
  sessionId: string;
  model: string;
  maxBudget: number;
}): Promise<IntentRecord> {
  const path = '/v1/intents/broadcast';
  const payload = await requestJson(path, { method: 'POST', body: JSON.stringify(input) });
  return requireRecord(payload, path, isIntentRecord, 'intent');
}

export async function fillIntent(intentId: string, solverId: string): Promise<IntentRecord> {
  const path = `/v1/intents/${encodeURIComponent(intentId)}/fill`;
  const payload = await requestJson(path, { method: 'POST', body: JSON.stringify({ solverId }) });
  return requireRecord(payload, path, isIntentRecord, 'intent');
}

export async function listTransactions(): Promise<TransactionRecord[]> {
  const path = '/v1/transactions';
  return readArray(await requestJson(path), 'transactions', path, isTransactionRecord);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.status === 0
      ? `Gateway connection failed: ${error.message}`
      : `${error.status} ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Unexpected gateway error.';
}
