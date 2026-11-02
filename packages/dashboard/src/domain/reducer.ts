import type {
  ApiResource,
  DashboardAction,
  DashboardState,
  ResourceDataMap,
  ResourceLoadedAction,
  ResourceName,
  ResourceStatus,
  SessionRecord,
} from './types';
import { MAX_TRACKED_SESSIONS } from './constants';

function emptyResource<T>(): ApiResource<T> {
  return { data: null, status: 'idle', scope: 'none', message: null, checkedAt: null };
}

function loadingResource<T>(resource: ApiResource<T>): ApiResource<T> {
  return {
    ...resource,
    status: resource.data === null ? 'loading' : 'stale',
    message: null,
  };
}

function failResource<T>(
  resource: ApiResource<T>,
  message: string,
  unsupported: boolean,
  checkedAt: number,
): ApiResource<T> {
  const status: ResourceStatus = resource.data !== null
    ? 'stale'
    : unsupported
      ? 'unavailable'
      : 'error';
  return { ...resource, status, message, checkedAt };
}

function loadedResource<T>(
  data: T,
  scope: ResourceLoadedAction['scope'],
  message: string | undefined,
  checkedAt: number,
): ApiResource<T> {
  return { data, status: 'ready', scope, message: message ?? null, checkedAt };
}

function applyLoadedResource(state: DashboardState, action: ResourceLoadedAction): DashboardState {
  switch (action.resource) {
    case 'health':
      return {
        ...state,
        health: loadedResource<ResourceDataMap['health']>(action.data, action.scope, action.message, action.checkedAt),
        lastRefreshAt: action.checkedAt,
      };
    case 'sessions':
      return { ...state, sessions: loadedResource<ResourceDataMap['sessions']>(action.data, action.scope, action.message, action.checkedAt) };
    case 'transactions':
      return { ...state, transactions: loadedResource<ResourceDataMap['transactions']>(action.data, action.scope, action.message, action.checkedAt) };
    case 'intents':
      return { ...state, intents: loadedResource<ResourceDataMap['intents']>(action.data, action.scope, action.message, action.checkedAt) };
    case 'sessionDetail':
      return { ...state, sessionDetail: loadedResource<ResourceDataMap['sessionDetail']>(action.data, action.scope, action.message, action.checkedAt) };
  }
}

function upsertSession(
  sessions: ApiResource<SessionRecord[]>,
  session: SessionRecord,
): ApiResource<SessionRecord[]> {
  const current = sessions.data ?? [];
  const data = [session, ...current.filter((item) => item.sessionId !== session.sessionId)];
  return {
    ...sessions,
    data,
    status: 'ready',
    scope: sessions.scope === 'global' ? 'global' : 'tracked',
    message: sessions.scope === 'global' ? null : 'Showing sessions returned by this console or explicitly tracked here.',
  };
}

export function createInitialDashboardState(): DashboardState {
  return {
    health: emptyResource(),
    sessions: emptyResource(),
    transactions: emptyResource(),
    intents: emptyResource(),
    sessionDetail: emptyResource(),
    selectedSessionId: null,
    trackedSessionIds: [],
    consoleIntents: [],
    observedEvents: [],
    stream: {
      status: 'idle',
      text: '',
      sessionId: null,
      requestedModel: null,
      actualModel: null,
      startedAt: null,
      completedAt: null,
      quotaAtResponse: null,
      quotaHeaderReadable: null,
      httpStatus: null,
      error: null,
    },
    lastRefreshAt: null,
  };
}

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'resource-loading': {
      const resource: ResourceName = action.resource;
      switch (resource) {
        case 'health': return { ...state, health: loadingResource(state.health) };
        case 'sessions': return { ...state, sessions: loadingResource(state.sessions) };
        case 'transactions': return { ...state, transactions: loadingResource(state.transactions) };
        case 'intents': return { ...state, intents: loadingResource(state.intents) };
        case 'sessionDetail': return { ...state, sessionDetail: loadingResource(state.sessionDetail) };
      }
    }
    case 'resource-loaded':
      return applyLoadedResource(state, action);
    case 'resource-failed': {
      const resource = action.resource;
      switch (resource) {
        case 'health':
          return { ...state, health: failResource(state.health, action.message, Boolean(action.unsupported), action.checkedAt) };
        case 'sessions':
          return { ...state, sessions: failResource(state.sessions, action.message, Boolean(action.unsupported), action.checkedAt) };
        case 'transactions':
          return { ...state, transactions: failResource(state.transactions, action.message, Boolean(action.unsupported), action.checkedAt) };
        case 'intents':
          return { ...state, intents: failResource(state.intents, action.message, Boolean(action.unsupported), action.checkedAt) };
        case 'sessionDetail':
          return { ...state, sessionDetail: failResource(state.sessionDetail, action.message, Boolean(action.unsupported), action.checkedAt) };
      }
    }
    case 'hydrate-session-preferences':
      return {
        ...state,
        trackedSessionIds: [...new Set(action.sessionIds)].slice(0, MAX_TRACKED_SESSIONS),
        selectedSessionId: action.selectedSessionId,
      };
    case 'select-session':
      return {
        ...state,
        selectedSessionId: action.sessionId,
        sessionDetail: action.sessionId && state.sessionDetail.data?.session.sessionId === action.sessionId
          ? state.sessionDetail
          : emptyResource(),
      };
    case 'track-session':
      return {
        ...state,
        trackedSessionIds: [...new Set([action.sessionId, ...state.trackedSessionIds])].slice(0, MAX_TRACKED_SESSIONS),
      };
    case 'untrack-session': {
      const trackedSessionIds = state.trackedSessionIds.filter((sessionId) => sessionId !== action.sessionId);
      const isTrackedView = state.sessions.scope === 'tracked' && state.sessions.data !== null;
      const trackedRecords = state.sessions.data;
      const sessions = isTrackedView && trackedRecords !== null
        ? { ...state.sessions, data: trackedRecords.filter((session) => session.sessionId !== action.sessionId) }
      : state.sessions;
      const transactions = state.transactions.scope === 'per-session' && state.transactions.data !== null
        ? { ...state.transactions, data: state.transactions.data.filter((transaction) => transaction.sessionId !== action.sessionId) }
        : state.transactions;
      const wasSelected = state.selectedSessionId === action.sessionId;
      return {
        ...state,
        trackedSessionIds,
        sessions,
        transactions,
        selectedSessionId: wasSelected ? null : state.selectedSessionId,
        sessionDetail: wasSelected ? emptyResource() : state.sessionDetail,
      };
    }
    case 'session-created':
    case 'session-updated':
      return {
        ...state,
        sessions: upsertSession(state.sessions, action.session),
        selectedSessionId: action.session.sessionId,
        trackedSessionIds: [...new Set([action.session.sessionId, ...state.trackedSessionIds])].slice(0, MAX_TRACKED_SESSIONS),
      };
    case 'intent-confirmed': {
      const confirmed = [action.intent, ...state.consoleIntents.filter((intent) => intent.intentId !== action.intent.intentId)];
      const intents = state.intents.data ?? [];
      const openIntents = action.intent.status === 'open'
        ? [action.intent, ...intents.filter((intent) => intent.intentId !== action.intent.intentId)]
        : intents.filter((intent) => intent.intentId !== action.intent.intentId);
      return {
        ...state,
        consoleIntents: confirmed.slice(0, 100),
        intents: { ...state.intents, data: openIntents, status: state.intents.data === null ? state.intents.status : 'ready' },
      };
    }
    case 'console-event':
      return { ...state, observedEvents: [action.event, ...state.observedEvents].slice(0, 100) };
    case 'stream-started':
      return {
        ...state,
        stream: {
          status: 'requesting',
          text: '',
          sessionId: action.sessionId,
          requestedModel: action.requestedModel,
          actualModel: null,
          startedAt: action.startedAt,
          completedAt: null,
          quotaAtResponse: null,
          quotaHeaderReadable: null,
          httpStatus: null,
          error: null,
        },
      };
    case 'stream-token':
      return { ...state, stream: { ...state.stream, status: 'streaming', text: state.stream.text + action.token } };
    case 'stream-model':
      return { ...state, stream: { ...state.stream, actualModel: action.model } };
    case 'stream-completed':
      return {
        ...state,
        stream: {
          ...state.stream,
          status: 'complete',
          quotaAtResponse: action.quotaAtResponse,
          quotaHeaderReadable: action.quotaHeaderReadable,
          completedAt: action.completedAt,
          httpStatus: 200,
        },
      };
    case 'stream-failed':
      return {
        ...state,
        stream: {
          ...state.stream,
          status: 'error',
          httpStatus: action.httpStatus,
          completedAt: action.failedAt,
          error: action.message,
        },
      };
  }
}
