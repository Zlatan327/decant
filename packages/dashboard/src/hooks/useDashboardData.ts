import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  ApiRequestError,
  broadcastIntent as postBroadcastIntent,
  errorMessage,
  fillIntent as postFillIntent,
  getHealth,
  getSessionDetail,
  listIntents,
  listSessions,
  listTransactions,
  registerSession as postRegisterSession,
  topUpSession as postTopUpSession,
} from '../api/client';
import { streamChatCompletion } from '../api/sse';
import { MAX_SCOPED_HISTORY_SESSIONS, MAX_TRACKED_SESSIONS, POLL_INTERVAL_MS } from '../domain/constants';
import { createInitialDashboardState, dashboardReducer } from '../domain/reducer';
import type {
  DashboardState,
  IntentRecord,
  ObservedEvent,
  RegisterSessionInput,
  SessionDetail,
  SessionRecord,
  TransactionRecord,
} from '../domain/types';

const TRACKED_SESSIONS_KEY = 'decant.operator.tracked-session-ids';
const SELECTED_SESSION_KEY = 'decant.operator.selected-session-id';

interface SessionSnapshot {
  records: SessionRecord[];
  details: Map<string, SessionDetail>;
  scope: 'global' | 'tracked' | 'per-session' | 'none';
}

function readPreferences(): { sessionIds: string[]; selectedSessionId: string | null } {
  if (typeof window === 'undefined') return { sessionIds: [], selectedSessionId: null };
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TRACKED_SESSIONS_KEY) ?? '[]');
    const sessionIds = Array.isArray(parsed)
      ? [...new Set(parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))].slice(0, MAX_TRACKED_SESSIONS)
      : [];
    const selected = window.localStorage.getItem(SELECTED_SESSION_KEY);
    return { sessionIds, selectedSessionId: selected && selected.trim() ? selected : null };
  } catch {
    return { sessionIds: [], selectedSessionId: null };
  }
}

function makeEvent(input: Omit<ObservedEvent, 'id' | 'timestamp'>): ObservedEvent {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return { ...input, id, timestamp: Date.now() };
}

function knownSessionIds(records: SessionRecord[], trackedIds: string[], selectedSessionId: string | null): string[] {
  const ids = [...new Set([
    ...(selectedSessionId ? [selectedSessionId] : []),
    ...(records.length > 0 ? records.map((record) => record.sessionId) : trackedIds),
  ])];
  return ids.slice(0, MAX_SCOPED_HISTORY_SESSIONS);
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

export interface DashboardController {
  state: DashboardState;
  refresh: () => Promise<void>;
  selectSession: (sessionId: string | null) => void;
  trackSession: (sessionId: string) => void;
  untrackSession: (sessionId: string) => void;
  registerSession: (input: RegisterSessionInput) => Promise<SessionRecord>;
  topUpSession: (sessionId: string, amount: number) => Promise<SessionRecord>;
  broadcastIntent: (input: { sessionId: string; model: string; maxBudget: number }) => Promise<IntentRecord>;
  fillIntent: (intentId: string, solverId: string) => Promise<IntentRecord>;
  runInference: (sessionId: string, model: string, prompt: string) => Promise<void>;
}

export function useDashboardData(): DashboardController {
  const [state, dispatch] = useReducer(dashboardReducer, undefined, () => {
    const preferences = readPreferences();
    const initial = createInitialDashboardState();
    return {
      ...initial,
      trackedSessionIds: preferences.sessionIds,
      selectedSessionId: preferences.selectedSessionId,
    };
  });
  const stateRef = useRef(state);
  const pollInFlight = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    try {
      window.localStorage.setItem(TRACKED_SESSIONS_KEY, JSON.stringify(state.trackedSessionIds));
      if (state.selectedSessionId) window.localStorage.setItem(SELECTED_SESSION_KEY, state.selectedSessionId);
      else window.localStorage.removeItem(SELECTED_SESSION_KEY);
    } catch {
      // Dashboard state remains usable when browser storage is disabled.
    }
  }, [state.trackedSessionIds, state.selectedSessionId]);

  const refresh = useCallback(async () => {
    if (pollInFlight.current) return;
    pollInFlight.current = true;
    const snapshot = stateRef.current;
    dispatch({ type: 'resource-loading', resource: 'health' });
    dispatch({ type: 'resource-loading', resource: 'sessions' });
    dispatch({ type: 'resource-loading', resource: 'transactions' });
    dispatch({ type: 'resource-loading', resource: 'intents' });

    const loadHealth = async () => {
      try {
        const data = await getHealth();
        dispatch({ type: 'resource-loaded', resource: 'health', data, scope: 'global', checkedAt: Date.now() });
      } catch (error) {
        dispatch({ type: 'resource-failed', resource: 'health', message: errorMessage(error), unsupported: isNotFound(error), checkedAt: Date.now() });
      }
    };

    const loadIntents = async () => {
      try {
        const data = await listIntents();
        dispatch({ type: 'resource-loaded', resource: 'intents', data, scope: 'global', checkedAt: Date.now() });
      } catch (error) {
        dispatch({ type: 'resource-failed', resource: 'intents', message: errorMessage(error), unsupported: isNotFound(error), checkedAt: Date.now() });
      }
    };

    const loadSessions = async (): Promise<SessionSnapshot> => {
      try {
        const records = await listSessions();
        dispatch({ type: 'resource-loaded', resource: 'sessions', data: records, scope: 'global', checkedAt: Date.now() });
        if (records.length > 0 && !records.some((record) => record.sessionId === snapshot.selectedSessionId)) {
          dispatch({ type: 'select-session', sessionId: records[0]?.sessionId ?? null });
        } else if (records.length === 0 && snapshot.selectedSessionId) {
          dispatch({ type: 'select-session', sessionId: null });
        }
        return { records, details: new Map(), scope: 'global' };
      } catch (error) {
        if (!isNotFound(error)) {
          dispatch({ type: 'resource-failed', resource: 'sessions', message: errorMessage(error), checkedAt: Date.now() });
          return {
            records: snapshot.sessions.data ?? [],
            details: new Map(),
            scope: snapshot.sessions.scope,
          };
        }

        const trackedIds = [...new Set([
          ...(snapshot.selectedSessionId ? [snapshot.selectedSessionId] : []),
          ...snapshot.trackedSessionIds,
        ])].slice(0, MAX_TRACKED_SESSIONS);
        if (trackedIds.length === 0) {
          dispatch({
            type: 'resource-failed',
            resource: 'sessions',
            message: 'GET /v1/sessions is not exposed by this gateway build. Track a known session ID or use a gateway build with global session discovery.',
            unsupported: true,
            checkedAt: Date.now(),
          });
          return { records: [], details: new Map(), scope: 'none' };
        }

        const detailResults = await Promise.allSettled(trackedIds.map((sessionId) => getSessionDetail(sessionId)));
        const details = new Map<string, SessionDetail>();
        for (let index = 0; index < detailResults.length; index += 1) {
          const result = detailResults[index];
          const sessionId = trackedIds[index];
          if (result?.status === 'fulfilled' && sessionId) details.set(sessionId, result.value);
        }
        const records = [...details.values()].map((detail) => detail.session);
        if (records.length === 0) {
          dispatch({
            type: 'resource-failed',
            resource: 'sessions',
            message: 'Global session discovery is unavailable and none of the explicitly tracked session IDs resolved.',
            unsupported: true,
            checkedAt: Date.now(),
          });
          return { records: [], details, scope: 'none' };
        }
        dispatch({
          type: 'resource-loaded',
          resource: 'sessions',
          data: records,
          scope: 'tracked',
          message: 'Global session listing returned 404; showing only explicitly tracked sessions.',
          checkedAt: Date.now(),
        });
        if (!records.some((record) => record.sessionId === snapshot.selectedSessionId)) {
          dispatch({ type: 'select-session', sessionId: records[0]?.sessionId ?? null });
        }
        return { records, details, scope: 'tracked' };
      }
    };

    try {
      const [sessionSnapshot] = await Promise.all([loadSessions(), loadHealth(), loadIntents()]);
      let detailsForCycle = new Map(sessionSnapshot.details);
      try {
        const transactions = await listTransactions();
        dispatch({ type: 'resource-loaded', resource: 'transactions', data: transactions, scope: 'global', checkedAt: Date.now() });
      } catch (error) {
        if (!isNotFound(error)) {
          dispatch({ type: 'resource-failed', resource: 'transactions', message: errorMessage(error), checkedAt: Date.now() });
        } else {
          const knownIds = knownSessionIds(sessionSnapshot.records, snapshot.trackedSessionIds, snapshot.selectedSessionId);
          if (knownIds.length === 0) {
            dispatch({
              type: 'resource-failed',
              resource: 'transactions',
              message: 'GET /v1/transactions is not exposed by this gateway build; no explicit session is available for scoped history.',
              unsupported: true,
              checkedAt: Date.now(),
            });
          } else {
            const details = new Map<string, SessionDetail>();
            for (const sessionId of knownIds) {
              const cachedDetail = sessionSnapshot.details.get(sessionId);
              if (cachedDetail) details.set(sessionId, cachedDetail);
            }
            const missingIds = knownIds.filter((sessionId) => !details.has(sessionId));
            const results = await Promise.allSettled(missingIds.map((sessionId) => getSessionDetail(sessionId)));
            for (let index = 0; index < results.length; index += 1) {
              const result = results[index];
              const sessionId = missingIds[index];
              if (result?.status === 'fulfilled' && sessionId) details.set(sessionId, result.value);
            }
            detailsForCycle = details;
            const uniqueTransactions = new Map<string, TransactionRecord>();
            for (const detail of details.values()) {
              for (const transaction of detail.transactions) uniqueTransactions.set(transaction.txId, transaction);
            }
            const records = [...uniqueTransactions.values()].sort((left, right) => right.timestamp - left.timestamp);
            const scopeMessage = `Global transaction listing returned 404; scoped history reads at most ${MAX_SCOPED_HISTORY_SESSIONS} session-detail records per refresh.`;
            dispatch({
              type: 'resource-loaded',
              resource: 'transactions',
              data: records,
              scope: 'per-session',
              message: scopeMessage,
              checkedAt: Date.now(),
            });
          }
        }
      }

      const selectedSessionId = sessionSnapshot.scope === 'global'
        ? (sessionSnapshot.records.some((record) => record.sessionId === snapshot.selectedSessionId)
          ? snapshot.selectedSessionId
          : sessionSnapshot.records[0]?.sessionId ?? null)
        : (sessionSnapshot.records.some((record) => record.sessionId === snapshot.selectedSessionId)
          ? snapshot.selectedSessionId
          : snapshot.selectedSessionId ?? sessionSnapshot.records[0]?.sessionId ?? null);
      if (selectedSessionId !== snapshot.selectedSessionId) {
        dispatch({ type: 'select-session', sessionId: selectedSessionId });
      }
      if (selectedSessionId) {
        dispatch({ type: 'resource-loading', resource: 'sessionDetail' });
        try {
          const detail = detailsForCycle.get(selectedSessionId)
            ?? await getSessionDetail(selectedSessionId);
          dispatch({ type: 'resource-loaded', resource: 'sessionDetail', data: detail, scope: 'per-session', checkedAt: Date.now() });
        } catch (error) {
          dispatch({ type: 'resource-failed', resource: 'sessionDetail', message: errorMessage(error), unsupported: isNotFound(error), checkedAt: Date.now() });
        }
      }
    } finally {
      pollInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => { void refresh(); }, 0);
    const pollTimer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const selectSession = useCallback((sessionId: string | null) => {
    dispatch({ type: 'select-session', sessionId });
    if (!sessionId) return;
    dispatch({ type: 'track-session', sessionId });
    dispatch({ type: 'resource-loading', resource: 'sessionDetail' });
    void getSessionDetail(sessionId).then((detail) => {
      dispatch({ type: 'resource-loaded', resource: 'sessionDetail', data: detail, scope: 'per-session', checkedAt: Date.now() });
    }).catch((error: unknown) => {
      dispatch({ type: 'resource-failed', resource: 'sessionDetail', message: errorMessage(error), unsupported: isNotFound(error), checkedAt: Date.now() });
    });
  }, []);

  const trackSession = useCallback((sessionId: string) => {
    const normalized = sessionId.trim();
    if (!normalized) return;
    dispatch({ type: 'track-session', sessionId: normalized });
    dispatch({ type: 'select-session', sessionId: normalized });
    dispatch({ type: 'resource-loading', resource: 'sessionDetail' });
    void getSessionDetail(normalized).then((detail) => {
      dispatch({ type: 'resource-loaded', resource: 'sessionDetail', data: detail, scope: 'tracked', checkedAt: Date.now() });
      dispatch({ type: 'session-updated', session: detail.session });
      dispatch({ type: 'console-event', event: makeEvent({ source: 'this-console', level: 'info', title: 'Session tracked', detail: `Loaded ${detail.session.sessionId} by explicit session ID.`, sessionId: detail.session.sessionId, httpStatus: 200 }) });
      void refresh();
    }).catch((error: unknown) => {
      dispatch({ type: 'resource-failed', resource: 'sessionDetail', message: errorMessage(error), unsupported: isNotFound(error), checkedAt: Date.now() });
      dispatch({ type: 'console-event', event: makeEvent({ source: 'this-console', level: 'warning', title: 'Session lookup failed', detail: errorMessage(error), sessionId: normalized, httpStatus: error instanceof ApiRequestError && error.status > 0 ? error.status : null }) });
    });
  }, [refresh]);

  const untrackSession = useCallback((sessionId: string) => {
    dispatch({ type: 'untrack-session', sessionId });
  }, []);

  const recordOperationFailure = useCallback((operation: string, error: unknown, sessionId: string | null) => {
    const status = error instanceof ApiRequestError && error.status > 0 ? error.status : null;
    const detail = errorMessage(error);
    const isBlocked = status === 401 || status === 402 || status === 403;
    const title = status === 402
      ? 'Quota exhausted · HTTP 402'
      : status === 403 && /signature|cryptographic/i.test(detail)
        ? 'Signature rejected · HTTP 403'
        : status === 403
          ? 'Gateway security policy rejected · HTTP 403'
          : status === 401
            ? 'Session authentication rejected · HTTP 401'
            : `${operation}${status === null ? ' failed' : ` · HTTP ${status}`}`;
    dispatch({
      type: 'console-event',
      event: makeEvent({
        source: 'this-console',
        level: isBlocked ? 'blocked' : 'warning',
        title,
        detail,
        sessionId,
        httpStatus: status,
      }),
    });
  }, []);

  const registerSession = useCallback(async (input: RegisterSessionInput) => {
    try {
      const session = await postRegisterSession(input);
      dispatch({ type: 'session-created', session });
      dispatch({ type: 'console-event', event: makeEvent({ source: 'this-console', level: 'success', title: 'Session registration confirmed', detail: `Gateway returned session ${session.sessionId} with ${session.remainingQuota} quota units.`, sessionId: session.sessionId, httpStatus: 201 }) });
      void refresh();
      return session;
    } catch (error) {
      recordOperationFailure('Session registration', error, input.sessionId || null);
      throw error;
    }
  }, [recordOperationFailure, refresh]);

  const topUpSession = useCallback(async (sessionId: string, amount: number) => {
    try {
      const session = await postTopUpSession(sessionId, amount);
      dispatch({ type: 'session-updated', session });
      dispatch({ type: 'console-event', event: makeEvent({ source: 'this-console', level: 'success', title: 'Quota top-up confirmed', detail: `Gateway added ${amount} quota units to ${sessionId}.`, sessionId, httpStatus: 200 }) });
      void refresh();
      return session;
    } catch (error) {
      recordOperationFailure('Quota top-up', error, sessionId);
      throw error;
    }
  }, [recordOperationFailure, refresh]);

  const broadcastIntent = useCallback(async (input: { sessionId: string; model: string; maxBudget: number }) => {
    try {
      const intent = await postBroadcastIntent(input);
      dispatch({ type: 'intent-confirmed', intent });
      dispatch({ type: 'console-event', event: makeEvent({ source: 'this-console', level: 'success', title: 'Intent broadcast confirmed', detail: `${intent.intentId} · ${intent.model} · budget ${intent.maxBudget} units.`, sessionId: intent.sessionId, httpStatus: 201 }) });
      void refresh();
      return intent;
    } catch (error) {
      recordOperationFailure('Intent broadcast', error, input.sessionId);
      throw error;
    }
  }, [recordOperationFailure, refresh]);

  const fillIntent = useCallback(async (intentId: string, solverId: string) => {
    try {
      const intent = await postFillIntent(intentId, solverId);
      dispatch({ type: 'intent-confirmed', intent });
      dispatch({ type: 'console-event', event: makeEvent({ source: 'this-console', level: 'success', title: 'Intent fill confirmed', detail: `${intent.intentId} assigned to ${intent.solverId ?? solverId}.`, sessionId: intent.sessionId, httpStatus: 200 }) });
      void refresh();
      return intent;
    } catch (error) {
      recordOperationFailure('Intent fill', error, null);
      throw error;
    }
  }, [recordOperationFailure, refresh]);

  const runInference = useCallback(async (sessionId: string, model: string, prompt: string) => {
    const startedAt = Date.now();
    dispatch({ type: 'stream-started', sessionId, requestedModel: model, startedAt });
    try {
      const result = await streamChatCompletion({
        sessionId,
        model,
        prompt,
        onToken: (token) => dispatch({ type: 'stream-token', token }),
        onModel: (actualModel) => dispatch({ type: 'stream-model', model: actualModel }),
      });
      const completedAt = Date.now();
      dispatch({
        type: 'stream-completed',
        quotaAtResponse: result.quotaAtResponse,
        quotaHeaderReadable: result.quotaHeaderReadable,
        completedAt,
      });
      const headerLabel = result.quotaAtResponse === null
        ? 'not readable (missing or not exposed by cross-origin CORS)'
        : `${result.quotaAtResponse} units after reservation`;
      dispatch({ type: 'console-event', event: makeEvent({ source: 'this-console', level: 'success', title: 'Inference stream completed', detail: `${result.responseModel ?? model} · ${completedAt - startedAt} ms round trip. Quota response header: ${headerLabel}.`, sessionId, httpStatus: 200 }) });
      void refresh();
    } catch (error) {
      const status = error instanceof ApiRequestError && error.status > 0 ? error.status : null;
      const message = errorMessage(error);
      dispatch({ type: 'stream-failed', message, httpStatus: status, failedAt: Date.now() });
      recordOperationFailure('Inference request', error, sessionId);
      void refresh();
    }
  }, [recordOperationFailure, refresh]);

  return {
    state,
    refresh,
    selectSession,
    trackSession,
    untrackSession,
    registerSession,
    topUpSession,
    broadcastIntent,
    fillIntent,
    runInference,
  };
}
