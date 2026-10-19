/**
 * client.ts — Decant Agent SDK.
 *
 * Lightweight client for AI agents to broadcast intents through the
 * Decant gateway.  Phase 1: raw HTTP transport with session headers.
 */

import { randomBytes } from "node:crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DecantClientOptions {
  /** Gateway base URL (default: http://localhost:8080) */
  gatewayUrl?: string;
  /** Pre-existing session key.  If omitted, an ephemeral key is generated. */
  sessionKey?: string;
}

export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
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
   * Send a request through the Decant gateway.
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
   * In Phase 1 this just wraps it in a POST body.
   */
  async sendPrompt(prompt: string): Promise<ProxyResponse> {
    return this.request("/post", "POST", JSON.stringify({ prompt }));
  }
}

// ─── CLI demo (run directly) ────────────────────────────────────────────────

const isMainModule = process.argv[1]?.endsWith("client.ts") || process.argv[1]?.endsWith("client.js");
if (isMainModule) {
  const client = new DecantClient();
  console.log(`[agent-sdk] session key: ${client.sessionKey}`);
  console.log(`[agent-sdk] gateway:     ${client.gatewayUrl}`);
  console.log(`[agent-sdk] sending GET /get …`);

  try {
    const res = await client.request("/get");
    console.log(`[agent-sdk] status: ${res.status}`);
    console.log(`[agent-sdk] body:\n${res.body.slice(0, 500)}`);
  } catch (err) {
    console.error(`[agent-sdk] error:`, err);
    process.exit(1);
  }
}
