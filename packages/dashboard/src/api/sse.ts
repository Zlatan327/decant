import { MAX_REQUEST_BODY_BYTES } from '../domain/constants';
import { ApiRequestError, gatewayUrl, parseApiError, operatorHeaders } from './client';
import type { SSEChunk } from '../domain/types';

export interface ChatStreamInput {
  sessionId: string;
  model: string;
  prompt: string;
  signal?: AbortSignal;
  onToken: (token: string) => void;
  onModel: (model: string) => void;
}

export interface ChatStreamResult {
  quotaAtResponse: number | null;
  quotaHeaderReadable: boolean;
  responseModel: string | null;
}

function parseQuotaHeader(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseChunk(data: string, onToken: (token: string) => void, onModel: (model: string) => void): boolean {
  if (data === '[DONE]') return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new ApiRequestError(502, '/v1/chat/completions', 'Gateway sent a malformed SSE data frame.');
  }
  if (!isRecord(parsed) || parsed.object !== 'chat.completion.chunk' || !Array.isArray(parsed.choices)) {
    throw new ApiRequestError(502, '/v1/chat/completions', 'Gateway sent a chunk outside the documented OpenAI-compatible SSE shape.');
  }

  const chunk = parsed as unknown as SSEChunk;
  if (typeof chunk.model === 'string') onModel(chunk.model);
  for (const choice of chunk.choices) {
    if (!isRecord(choice) || !isRecord(choice.delta)) continue;
    const content = choice.delta.content;
    if (typeof content === 'string' && content.length > 0) onToken(content);
  }
  return false;
}

export async function streamChatCompletion(input: ChatStreamInput): Promise<ChatStreamResult> {
  const path = '/v1/chat/completions';
  const payload = JSON.stringify({
    model: input.model,
    messages: [{ role: 'user', content: input.prompt }],
    stream: true,
  });
  if (new TextEncoder().encode(payload).byteLength > MAX_REQUEST_BODY_BYTES) {
    throw new ApiRequestError(413, path, 'Prompt payload exceeds the console limit for this gateway. Shorten the prompt and retry.');
  }

  let response: Response;
  try {
    response = await fetch(gatewayUrl(path), {
      method: 'POST',
      credentials: 'omit',
      signal: input.signal,
      headers: {
        Accept: 'text/event-stream',
        ...operatorHeaders(),
        'Content-Type': 'application/json',
        'X-Decant-Session': input.sessionId,
      },
      body: payload,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const message = error instanceof Error ? error.message : 'Network connection failed.';
    throw new ApiRequestError(0, path, message);
  }

  if (!response.ok) throw await parseApiError(response, path);
  if (!response.body) throw new ApiRequestError(502, path, 'Gateway returned no stream body.');
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    throw new ApiRequestError(502, path, `Expected text/event-stream, received '${contentType || 'unknown content type'}'.`);
  }

  const quotaHeader = response.headers.get('X-Decant-Quota-Remaining');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const dataLines: string[] = [];
  let buffer = '';
  let doneFrame = false;
  let responseModel: string | null = null;

  const processEvent = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    dataLines.length = 0;
    doneFrame = parseChunk(data, input.onToken, (model) => {
      responseModel = model;
      input.onModel(model);
    });
  };

  const processLine = (line: string) => {
    if (line === '') {
      processEvent();
      return;
    }
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  };

  try {
    while (!doneFrame) {
      const result = await reader.read();
      buffer += decoder.decode(result.value, { stream: !result.done });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        processLine(buffer.slice(0, newline).replace(/\r$/, ''));
        buffer = buffer.slice(newline + 1);
        if (doneFrame) break;
        newline = buffer.indexOf('\n');
      }
      if (result.done) {
        if (buffer.length > 0) processLine(buffer.replace(/\r$/, ''));
        processEvent();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    quotaAtResponse: parseQuotaHeader(quotaHeader),
    quotaHeaderReadable: quotaHeader !== null,
    responseModel,
  };
}
