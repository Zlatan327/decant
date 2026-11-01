/**
 * client.ts — Decant Agent SDK.
 *
 * Lightweight client for AI agents to broadcast intents, authenticate through
 * the Decant gateway, and consume streaming inference from Web3 DePIN compute providers.
 */

import { randomBytes } from "node:crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DecantClientOptions {
  /** Gateway base URL (default: http://localhost:8080) */
  gatewayUrl?: string;
  /** Pre-existing session key. If omitted, an ephemeral key is generated. */
  sessionKey?: string;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface StreamResult {
  status: number;
  fullText: string;
  tokens: number;
  quotaRemaining?: number;
}

// ─── Client class ───────────────────────────────────────────────────────────

export class DecantClient {
  readonly gatewayUrl: string;
  readonly sessionKey: string;

  constructor(opts: DecantClientOptions = {}) {
    this.gatewayUrl = (opts.gatewayUrl ?? "http://localhost:8080").replace(/\/$/, "");
    this.sessionKey = opts.sessionKey ?? DecantClient.generateSessionKey();
  }

  /** Generate a cryptographically random ephemeral session key. */
  static generateSessionKey(): string {
    return randomBytes(16).toString("hex");
  }

  /**
   * Send a standard request through the Decant gateway.
   *
   * @param path    Upstream path to hit via the proxy (e.g. "/get")
   * @param method  HTTP method (default: GET)
   * @param body    Optional request body (for POST/PUT)
   */
  async request(
    path: string = "/get",
    method: string = "GET",
    body?: string
  ): Promise<ProxyResponse> {
    const url = `${this.gatewayUrl}${path}`;
    const headers: Record<string, string> = {
      "X-Decant-Session": this.sessionKey,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body).toString();
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
    });

    const responseBody = await res.text();
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    return {
      status: res.status,
      headers: responseHeaders,
      body: responseBody,
    };
  }

  /**
   * Convenience: send a raw prompt payload through the proxy.
   */
  async sendPrompt(prompt: string): Promise<ProxyResponse> {
    return this.request("/post", "POST", JSON.stringify({ prompt }));
  }

  /**
   * Stream Llama 3 inference progressively from a Web3 DePIN compute solver.
   *
   * Parses live Server-Sent Events (SSE) data chunks across the wire,
   * invokes `onToken` for each token received, and returns the assembled text.
   */
  async streamChat(
    prompt: string,
    onToken?: (token: string) => void
  ): Promise<StreamResult> {
    const url = `${this.gatewayUrl}/v1/chat/completions`;
    const payload = JSON.stringify({
      model: "meta-llama/Meta-Llama-3-8B-Instruct",
      prompt,
      stream: true,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Decant-Session": this.sessionKey,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: payload,
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        status: res.status,
        fullText: errText,
        tokens: 0,
      };
    }

    const remainingHeader = res.headers.get("x-decant-quota-remaining");
    const quotaRemaining = remainingHeader ? parseInt(remainingHeader, 10) : undefined;

    let fullText = "";
    let tokenCount = 0;

    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete tail in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              fullText += token;
              tokenCount += 1;
              if (onToken) onToken(token);
            }
          } catch {
            // Ignore malformed intermediate chunks
          }
        }
      }
    }

    return {
      status: res.status,
      fullText,
      tokens: tokenCount,
      quotaRemaining,
    };
  }
}

// ─── CLI demo ───────────────────────────────────────────────────────────────

const isMainModule = process.argv[1]?.endsWith("client.ts") || process.argv[1]?.endsWith("client.js");
if (isMainModule) {
  const client = new DecantClient();
  console.log(`[agent-sdk] session key: ${client.sessionKey}`);
  console.log(`[agent-sdk] gateway:     ${client.gatewayUrl}`);
  console.log(`[agent-sdk] testing connection to gateway...`);

  try {
    const res = await client.request("/get");
    console.log(`[agent-sdk] status: ${res.status}`);
    console.log(`[agent-sdk] body:\n${res.body.slice(0, 300)}`);
  } catch (err) {
    console.error(`[agent-sdk] error:`, err);
    process.exit(1);
  }
}
