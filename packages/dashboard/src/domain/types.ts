export type SessionStatus = 'active' | 'exhausted' | 'suspended';
export type IntentStatus = 'open' | 'filled' | 'settled' | 'expired';
export type ResourceStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'unavailable' | 'error';
export type DataScope = 'none' | 'global' | 'tracked' | 'per-session';

export interface GatewayHealth {
  models?: string[];
  inferenceConfigured?: boolean;
  status: string;
  uptime: number;
  ledger: string;
  nearSync: string;
  timestamp?: number;
}

export interface SessionRecord {
  sessionId: string;
  publicKey: string;
  ownerAccountId: string;
  totalQuota: number;
  remainingQuota: number;
  createdAt: number;
  status: SessionStatus;
}

export interface IntentRecord {
  intentId: string;
  sessionId: string;
  model: string;
  maxBudget: number;
  status: IntentStatus;
  solverId: string | null;
  createdAt: number;
  filledAt: number | null;
}

export interface TransactionRecord {
  txId: string;
  sessionId: string;
  promptTokens: number;
  completionTokens: number;
  costUnits: number;
  model: string;
  upstreamLatencyMs: number;
  timestamp: number;
}

export interface SessionDetail {
  session: SessionRecord;
  transactions: TransactionRecord[];
}

export interface ApiResource<T> {
  data: T | null;
  status: ResourceStatus;
  scope: DataScope;
  message: string | null;
  checkedAt: number | null;
}

export type ResourceName = 'health' | 'sessions' | 'transactions' | 'intents' | 'sessionDetail';

export interface ResourceDataMap {
  health: GatewayHealth;
  sessions: SessionRecord[];
  transactions: TransactionRecord[];
  intents: IntentRecord[];
  sessionDetail: SessionDetail;
}

export type ResourceLoadedAction = {
  [K in ResourceName]: {
    type: 'resource-loaded';
    resource: K;
    data: ResourceDataMap[K];
    scope: DataScope;
    message?: string;
    checkedAt: number;
  }
}[ResourceName];

export interface SSEChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { content?: string };
    finish_reason: null | 'stop';
  }>;
}

export interface StreamState {
  status: 'idle' | 'requesting' | 'streaming' | 'complete' | 'error';
  text: string;
  sessionId: string | null;
  requestedModel: string | null;
  actualModel: string | null;
  startedAt: number | null;
  completedAt: number | null;
  quotaAtResponse: number | null;
  quotaHeaderReadable: boolean | null;
  httpStatus: number | null;
  error: string | null;
}

export interface ObservedEvent {
  id: string;
  timestamp: number;
  source: 'gateway-ledger' | 'this-console';
  level: 'success' | 'warning' | 'blocked' | 'info';
  title: string;
  detail: string;
  sessionId: string | null;
  httpStatus: number | null;
}

export interface DashboardState {
  health: ApiResource<GatewayHealth>;
  sessions: ApiResource<SessionRecord[]>;
  transactions: ApiResource<TransactionRecord[]>;
  intents: ApiResource<IntentRecord[]>;
  sessionDetail: ApiResource<SessionDetail>;
  selectedSessionId: string | null;
  trackedSessionIds: string[];
  consoleIntents: IntentRecord[];
  observedEvents: ObservedEvent[];
  stream: StreamState;
  lastRefreshAt: number | null;
}

export type DashboardAction =
  | { type: 'resource-loading'; resource: ResourceName }
  | ResourceLoadedAction
  | { type: 'resource-failed'; resource: ResourceName; message: string; unsupported?: boolean; checkedAt: number }
  | { type: 'hydrate-session-preferences'; sessionIds: string[]; selectedSessionId: string | null }
  | { type: 'select-session'; sessionId: string | null }
  | { type: 'track-session'; sessionId: string }
  | { type: 'untrack-session'; sessionId: string }
  | { type: 'session-created'; session: SessionRecord }
  | { type: 'session-updated'; session: SessionRecord }
  | { type: 'intent-confirmed'; intent: IntentRecord }
  | { type: 'console-event'; event: ObservedEvent }
  | { type: 'stream-started'; sessionId: string; requestedModel: string; startedAt: number }
  | { type: 'stream-token'; token: string }
  | { type: 'stream-model'; model: string }
  | { type: 'stream-completed'; quotaAtResponse: number | null; quotaHeaderReadable: boolean; completedAt: number }
  | { type: 'stream-failed'; message: string; httpStatus: number | null; failedAt: number };

export interface RegisterSessionInput {
  sessionId: string;
  publicKey: string;
  ownerAccountId?: string;
  quota: number;
}
