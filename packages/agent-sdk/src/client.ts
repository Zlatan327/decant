/**
 * client.ts — Decant Production Agent SDK.
 *
 * Developer toolkit for autonomous AI agents to:
 *   1. Generate cryptographic Ed25519 keypairs adhering to the NEAR protocol standard.
 *   2. Cryptographically sign HTTP payloads (preventing tampering & replay attacks).
 *   3. Stream live LLM inference tokens with async generators (`for await (const token of ...)`).
 *   4. Broadcast compute intents to decentralized solvers.
 */

import { KeyPair, KeyPairEd25519 } from "near-api-js";
import { createHash } from "node:crypto";

export interface DecantClientOptions {
  gatewayUrl?: string;
  keyPair?: KeyPairEd25519;
  sessionId?: string;
  sessionKey?: string; // backwards compatibility
  enableCryptoSigning?: boolean;
}

export interface StreamResponse {
  tokens: number;
  tokenList: string[];
  fullText: string;
  totalTokens: number;
  status: number;
  quotaRemaining?: number;
}

export class DecantClient {
  public readonly gatewayUrl: string;
  public readonly keyPair: KeyPairEd25519;
  public readonly sessionId: string;
  public readonly sessionKey: string;
  public readonly publicKey: string;
  private enableSigning: boolean;

  constructor(opts: DecantClientOptions = {}) {
    this.gatewayUrl = (opts.gatewayUrl ?? "http://localhost:8080").replace(/\/$/, "");
    this.keyPair = opts.keyPair ?? (KeyPair.fromRandom("ed25519") as KeyPairEd25519);
    this.publicKey = this.keyPair.getPublicKey().toString();
    this.sessionId = opts.sessionId ?? opts.sessionKey ?? this.publicKey.replace("ed25519:", "").substring(0, 32);
    this.sessionKey = this.sessionId;
    this.enableSigning = opts.enableCryptoSigning ?? true;
  }

  public static generateSessionKey(): string {
    return KeyPair.fromRandom("ed25519").getPublicKey().toString().replace("ed25519:", "").substring(0, 32);
  }

  public generateHeaders(
    method: string,
    path: string,
    body: string = ""
  ): Record<string, string> {
    const timestamp = Date.now();
    const headers: Record<string, string> = {
      "X-Decant-Session": this.sessionId,
      "X-Decant-Public-Key": this.publicKey,
      "X-Decant-Timestamp": timestamp.toString(),
      Accept: "application/json",
    };

    if (this.enableSigning) {
      const bodyHash = createHash("sha256").update(body).digest("hex");
      const digest = createHash("sha256")
        .update(`${method.toUpperCase()}:${path}:${timestamp}:${this.sessionId}:${bodyHash}`)
        .digest();

      const signature = this.keyPair.sign(digest);
      headers["X-Decant-Signature"] = Buffer.from(signature.signature).toString("hex");
    }

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }

  public async request(
    path: string = "/get",
    method: string = "GET",
    body?: string
  ): Promise<{ status: number; body: string; headers: Record<string, string> }> {
    const url = `${this.gatewayUrl}${path}`;
    const headers = this.generateHeaders(method, path, body ?? "");

    const res = await fetch(url, {
      method,
      headers,
      body: body ?? undefined,
    });

    const resText = await res.text();
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k.toLowerCase()] = v;
    });

    return {
      status: res.status,
      body: resText,
      headers: resHeaders,
    };
  }

  /**
   * Helper streaming method collecting full response while invoking real-time callbacks.
   */
  public async streamChat(
    prompt: string,
    onToken?: (token: string) => void
  ): Promise<StreamResponse> {
    const path = "/v1/chat/completions";
    const payload = JSON.stringify({
      model: "meta-llama/Meta-Llama-3-8B-Instruct",
      messages: [{ role: "user", content: prompt }],
      prompt,
      stream: true,
    });

    const headers = this.generateHeaders("POST", path, payload);
    headers["Accept"] = "text/event-stream";

    const res = await fetch(`${this.gatewayUrl}${path}`, {
      method: "POST",
      headers,
      body: payload,
    });

    const quotaHeader = res.headers.get("x-decant-quota-remaining");
    const quotaRemaining = quotaHeader ? parseInt(quotaHeader, 10) : undefined;

    if (!res.ok) {
      const errText = await res.text();
      return {
        tokens: 0,
        tokenList: [],
        fullText: errText,
        totalTokens: 0,
        status: res.status,
        quotaRemaining,
      };
    }

    const tokens: string[] = [];
    let fullText = "";

    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              tokens.push(token);
              fullText += token;
              if (onToken) onToken(token);
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return {
      tokens: tokens.length,
      tokenList: tokens,
      fullText,
      totalTokens: tokens.length,
      status: 200,
      quotaRemaining,
    };
  }

  public async broadcastIntent(model: string, maxBudget: number): Promise<any> {
    const path = "/v1/intents/broadcast";
    const payload = JSON.stringify({
      sessionId: this.sessionId,
      model,
      maxBudget,
    });
    const headers = this.generateHeaders("POST", path, payload);

    const res = await fetch(`${this.gatewayUrl}${path}`, {
      method: "POST",
      headers,
      body: payload,
    });

    return res.json();
  }

  public async getSessionInfo(): Promise<any> {
    const path = `/v1/sessions/${this.sessionId}`;
    const headers = this.generateHeaders("GET", path);

    const res = await fetch(`${this.gatewayUrl}${path}`, {
      method: "GET",
      headers,
    });

    return res.json();
  }
}
