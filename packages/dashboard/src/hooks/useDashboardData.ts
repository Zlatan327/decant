import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  ApiRequestError,
  broadcastIntent as postBroadcastIntent,
  errorMessage,
  fillIntent as postFillIntent,
  getHealth,
  getSessionDetail,
  hasOperatorKey,
  listIntents,
  listSessions,
  listTransactions,
  registerSession as postRegisterSession,
  resumeSession as postResumeSession,
  suspendSession as postSuspendSession,
  topUpSession as postTopUpSession,
} from '../api/client';
import { streamChatCompletion, type ChatMessageItem } from '../api/sse';
import { MAX_TRACKED_SESSIONS, POLL_INTERVAL_MS } from '../domain/constants';
import { createInitialDashboardState, dashboardReducer } from '../domain/reducer';
import type {
  DashboardState,
  IntentRecord,
  ObservedEvent,
  RegisterSessionInput,
  SessionRecord,
} from '../domain/types';

const TRACKED_SESSIONS_KEY = 'decant.operator.tracked-session-ids';
const SELECTED_SESSION_KEY = 'decant.operator.selected-session-id';

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

function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

export interface InferenceRunOptions {
  maxTokens?: number;
  temperature?: number;
  messages?: ChatMessageItem[];
}

export interface DashboardController {
  state: DashboardState;
  refresh: () => Promise<void>;
  selectSession: (sessionId: string | null) => void;
  trackSession: (sessionId: string) => void;
  untrackSession: (sessionId: string) => void;
  registerSession: (input: RegisterSessionInput) => Promise<SessionRecord>;
  topUpSession: (sessionId: string, amount: number) => Promise<SessionRecord>;
  suspendSession: (sessionId: string) => Promise<SessionRecord>;
  resumeSession: (sessionId: string) => Promise<SessionRecord>;
  broadcastIntent: (input: { sessionId: string; model: string; maxBudget: number }) => Promise<IntentRecord>;
  fillIntent: (intentId: string, solverId: string) => Promise<IntentRecord>;
  runInference: (sessionId: string, model: string, prompt: string, options?: InferenceRunOptions) => Promise<void>;
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

    const loadHealth = async () => {
      try {
        const data = await getHealth();
        dispatch({ type: 'resource-loaded', resource: 'health', data, scope: 'global', checkedAt: Date.now() });
      } catch (error) {
        dispatch({ type: 'resource-failed', resource: 'health', message: errorMessage(error), unsupported: isNotFound(error), checkedAt: Date.now() });
      }
    };

    // Operator-key polling gate: when no operator key is set, only poll health.
    // Prevents spamming protected operator routes that answer 403/503.
    if (!hasOperatorKey()) {
      try {
        await loadHealth();
      } finally {
        pollInFlight.current = false;
      }
      return;
    }

    dispatch({ type: 'resource-loading', resource: 'sessions' });
    dispatch({ type: 'resource-loading', resource: 'transactions' });
    dispatch({ type: 'resource-loading', resource: 'intents' });

    const loadIntents = async () => {
      try {
        const data = await listIntents();
        dispatch({ type: 'resource-loaded', resource: 'intents', data, scope: 'global', checkedAt: Date.now() });
      } catch (error) {
        dispatch({ type: 'resource-failed', resource: 'intents', message: errorMessage(error), unsupported: isNotFound(error), checkedAt: Date.now() });
      }
    };

    const loadSessions = async (): Promise<SessionRecord[]> => {
      try {
        const records = await listSessions();
        dispatch({ type: 'resource-loaded', resource: 'sessions', data: records, scope: 'global', checkedAt: Date.now() });
        if (records.length > 0 && !records.some((record) => record.sessionId === snapshot.selectedSessionId)) {
          dispatch({ type: 'select-session', sessionId: records[0]?.sessionId ?? null });
        } else if (records.length === 0 && snapshot.selectedSessionId) {
          dispatch({ type: 'select-session', sessionId: null });
        }
        return records;
      } catch (error) {
        dispatch({ type: 'resource-failed', resource: 'sessions', message: errorMessage(error), checkedAt: Date.now() });
        return snapshot.sessions.data ?? [];
      }
    };

    const loadTransactions = async () => {
      try {
        const transactions = await listTransactions();
        dispatch({ type: 'resource-loaded', resource: 'transactions', data: transactions, scope: 'global', checkedAt: Date.now() });
      } catch (error) {
        dispatch({ type: 'resource-failed', resource: 'transactions', message: errorMessage(error), checkedAt: Date.now() });
      }
    };

    try {
      const [, records] = await Promise.all([loadHealth(), loadSessions(), loadIntents(), loadTransactions()]);

      // If a session is selected, fetch its detail
      const targetSessionId = snapshot.selectedSessionId || records?.[0]?.sessionId;
      if (targetSessionId) {
        dispatch({ type: 'resource-loading', resource: 'sessionDetail' });
        try {
          const detail = await getSessionDetail(targetSessionId);
          dispatch({ type: 'resource-loaded', resource: 'sessionDetail', data: detail, scope: 'per-session', checkedAt: Date.now() });
        } catch (error) {
          dispatch({ type: 'resource-failed', resource: 'sessionDetail', message: errorMessage(error), checkedAt: Date.now() });
        }
      }
    } finally {
      pollInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const selectSession = useCallback((sessionId: string | null) => {
    dispatch({ type: 'select-session', sessionId });
    if (!sessionId) return;
    dispatch({ type: 'resource-loading', resource: 'sessionDetail' });
    void getSessionDetail(sessionId)
      .then((detail) => dispatch({ type: 'resource-loaded', resource: 'sessionDetail', data: detail, scope: 'per-session', checkedAt: Date.now() }))
      .catch((error) => dispatch({ type: 'resource-failed', resource: 'sessionDetail', message: errorMessage(error), checkedAt: Date.now() }));
  }, []);

  const trackSession = useCallback((sessionId: string) => {
    dispatch({ type: 'track-session', sessionId });
  }, []);

  const untrackSession = useCallback((sessionId: string) => {
    dispatch({ type: 'untrack-session', sessionId });
  }, []);

  const recordOperationFailure = useCallback((title: string, error: unknown, sessionId: string | null) => {
    const message = errorMessage(error);
    const status = error instanceof ApiRequestError && error.status > 0 ? error.status : null;
    const isBlocked = status === 402 || status === 403 || status === 413 || status === 429;
    const detail = status ? `Gateway answered with HTTP ${status}: ${message}` : message;
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

  const suspendSession = useCallback(async (sessionId: string) => {
    try {
      const session = await postSuspendSession(sessionId);
      dispatch({ type: 'session-updated', session });
      dispatch({ type: 'console-event', event: makeEvent({ source: 'this-console', level: 'warning', title: 'Session suspended (kill switch)', detail: `Session ${sessionId} has been suspended. All compute access blocked.`, sessionId, httpStatus: 200 }) });
      void refresh();
      return session;
    } catch (error) {
      recordOperationFailure('Session suspend', error, sessionId);
      throw error;
    }
  }, [recordOperationFailure, refresh]);

  const resumeSession = useCallback(async (sessionId: string) => {
    try {
      const session = await postResumeSession(sessionId);
      dispatch({ type: 'session-updated', session });
      dispatch({ type: 'console-event', event: makeEvent({ source: 'this-console', level: 'success', title: 'Session resumed', detail: `Session ${sessionId} has been resumed. Compute access restored.`, sessionId, httpStatus: 200 }) });
      void refresh();
      return session;
    } catch (error) {
      recordOperationFailure('Session resume', error, sessionId);
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

  const runInference = useCallback(async (sessionId: string, model: string, prompt: string, options?: InferenceRunOptions) => {
    const startedAt = Date.now();
    dispatch({ type: 'stream-started', sessionId, requestedModel: model, startedAt });
    try {
      const result = await streamChatCompletion({
        sessionId,
        model,
        prompt,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
        messages: options?.messages,
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
    suspendSession,
    resumeSession,
    broadcastIntent,
    fillIntent,
    runInference,
  };
}
