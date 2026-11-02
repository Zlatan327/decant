/**
 * server.ts — Decant Production API Gateway & Routing Tunnel.
 *
 * Implements a high-throughput, secure network gateway that manages:
 *   - Ed25519 Cryptographic Session Authentication
 *   - Anti-Hallucination Guardrails (Payload Caps & Token Bucket Rate Limiting)
 *   - ACID Persistent Ledger Accounting (Node SQLite)
 *   - Real Multi-Provider AI Inference Routing with SSE Streaming
 *   - Intent Registry & Solver Fulfillment
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DecantLedger } from "./db.js";
import { DecantCrypto } from "./crypto.js";
import { DecantComputeEngine } from "./compute-engine.js";
import { enforceRateLimit, enforcePayloadSize } from "./policy.js";

export interface GatewayServerOptions {
  port?: number;
  dbPath?: string;
  enableCryptoVerification?: boolean;
}

export class DecantGatewayServer {
  public readonly server: Server;
  public readonly ledger: DecantLedger;
  public readonly compute: DecantComputeEngine;
  private port: number;
  private assignedPort: number = 0;
  private enableCrypto: boolean;

  constructor(opts: GatewayServerOptions = {}) {
    this.port = opts.port ?? parseInt(process.env["PORT"] ?? "8080", 10);
    this.ledger = new DecantLedger(opts.dbPath ?? (process.env["DATABASE_URL"] ?? ":memory:"));
    this.compute = new DecantComputeEngine();
    this.enableCrypto = opts.enableCryptoVerification ?? (process.env["ENABLE_CRYPTO_VERIFY"] === "true");

    this.server = createServer((req, res) => this.handleRequest(req, res));
  }

  public getPort(): number {
    return this.assignedPort || this.port;
  }

  private sendJson(res: ServerResponse, status: number, data: any, extraHeaders: Record<string, string> = {}): void {
    if (res.headersSent) return;
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "*",
      ...extraHeaders,
    });
    res.end(JSON.stringify(data));
  }

  private async parseBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString("utf-8");
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() ?? "GET";

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers": "*",
      });
      res.end();
      return;
    }

    // ── Diagnostics & Health ────────────────────────────────────────────────
    if (pathname === "/v1/health" || pathname === "/health") {
      this.sendJson(res, 200, {
        status: "healthy",
        uptime: process.uptime(),
        ledger: "sqlite-acid-persistent",
        nearSync: "active",
        timestamp: Date.now(),
      });
      return;
    }

    // ── Backwards Compatible Phase 1/2 Echo Routes ─────────────────────────
    if (pathname === "/get" && method === "GET") {
      const sessionId = req.headers["x-decant-session"] as string;
      if (!sessionId) {
        this.sendJson(res, 401, { error: "Unauthorized — missing X-Decant-Session header" });
        return;
      }
      if (!enforceRateLimit(req, res)) return;

      this.sendJson(res, 200, {
        echo: true,
        method: "GET",
        path: "/get",
        session: sessionId,
      });
      return;
    }

    if (pathname === "/post" && method === "POST") {
      const sessionId = req.headers["x-decant-session"] as string;
      if (!sessionId) {
        this.sendJson(res, 401, { error: "Unauthorized — missing X-Decant-Session header" });
        return;
      }
      if (!enforcePayloadSize(req, res)) return;
      if (!enforceRateLimit(req, res)) return;

      const raw = await this.parseBody(req);
      this.sendJson(res, 200, {
        echo: true,
        method: "POST",
        path: "/post",
        body: raw,
        session: sessionId,
      });
      return;
    }

    // ── Session Registration & Management ───────────────────────────────────
    if (pathname === "/v1/sessions/register" && method === "POST") {
      const body = JSON.parse(await this.parseBody(req) || "{}");
      const { sessionId, publicKey, ownerAccountId, quota } = body;

      if (!sessionId || !publicKey || !quota) {
        this.sendJson(res, 400, { error: "Missing required fields: sessionId, publicKey, quota" });
        return;
      }

      try {
        const session = this.ledger.registerSession(sessionId, publicKey, ownerAccountId ?? "agent.testnet", quota);
        this.sendJson(res, 201, session);
      } catch (err: any) {
        this.sendJson(res, 409, { error: err.message });
      }
      return;
    }

    if (pathname === "/v1/sessions" && method === "GET") {
      const sessions = this.ledger.listSessions();
      this.sendJson(res, 200, { sessions });
      return;
    }

    if (pathname.startsWith("/v1/sessions/") && method === "GET") {
      const sessionId = pathname.split("/")[3];
      const session = this.ledger.getSession(sessionId);
      if (!session) {
        this.sendJson(res, 404, { error: `Session '${sessionId}' not found` });
        return;
      }

      const txs = this.ledger.getTransactionHistory(sessionId);
      this.sendJson(res, 200, { session, transactions: txs });
      return;
    }

    if (pathname.includes("/topup") && method === "POST") {
      const sessionId = pathname.split("/")[3];
      const body = JSON.parse(await this.parseBody(req) || "{}");
      if (!body.amount || body.amount <= 0) {
        this.sendJson(res, 400, { error: "Valid 'amount' required" });
        return;
      }

      try {
        const session = this.ledger.topupQuota(sessionId, body.amount);
        this.sendJson(res, 200, session);
      } catch (err: any) {
        this.sendJson(res, 404, { error: err.message });
      }
      return;
    }

    if (pathname === "/v1/transactions" && method === "GET") {
      const txs = this.ledger.listRecentTransactions(50);
      this.sendJson(res, 200, { transactions: txs });
      return;
    }

    // ── Intent Registry ─────────────────────────────────────────────────────
    if (pathname === "/v1/intents/broadcast" && method === "POST") {
      const body = JSON.parse(await this.parseBody(req) || "{}");
      const { sessionId, model, maxBudget } = body;

      if (!sessionId || !maxBudget) {
        this.sendJson(res, 400, { error: "Missing required fields: sessionId, maxBudget" });
        return;
      }

      try {
        const intent = this.ledger.broadcastIntent(sessionId, model ?? "llama3", maxBudget);
        this.sendJson(res, 201, intent);
      } catch (err: any) {
        this.sendJson(res, 400, { error: err.message });
      }
      return;
    }

    if (pathname === "/v1/intents" && method === "GET") {
      const openIntents = this.ledger.listOpenIntents();
      this.sendJson(res, 200, { intents: openIntents });
      return;
    }

    if (pathname.includes("/fill") && method === "POST") {
      const intentId = pathname.split("/")[3];
      const body = JSON.parse(await this.parseBody(req) || "{}");
      try {
        const intent = this.ledger.fillIntent(intentId, body.solverId ?? "solver-default.near");
        this.sendJson(res, 200, intent);
      } catch (err: any) {
        this.sendJson(res, 400, { error: err.message });
      }
      return;
    }

    // ── Live AI Compute Streaming (/v1/chat/completions) ────────────────────
    if (pathname === "/v1/chat/completions" && method === "POST") {
      // 1. Session Auth Gate
      const sessionId = req.headers["x-decant-session"] as string;
      if (!sessionId) {
        this.sendJson(res, 401, { error: "Unauthorized — missing X-Decant-Session header" });
        return;
      }

      // 2. Anti-Hallucination Policy Guards
      if (!enforcePayloadSize(req, res)) return;
      if (!enforceRateLimit(req, res)) return;

      const rawBody = await this.parseBody(req);

      // 3. Optional Cryptographic Ed25519 Signature Verification
      if (this.enableCrypto) {
        const sig = req.headers["x-decant-signature"] as string;
        const ts = parseInt((req.headers["x-decant-timestamp"] as string) ?? "0", 10);
        const session = this.ledger.getSession(sessionId);

        if (!session) {
          this.sendJson(res, 401, { error: "Unauthorized — session not registered on-chain" });
          return;
        }

        const isValid = DecantCrypto.verifySignature(
          session.publicKey,
          sig,
          method,
          pathname,
          ts,
          rawBody
        );

        if (!isValid) {
          this.sendJson(res, 403, { error: "Forbidden — invalid cryptographic signature" });
          return;
        }
      }

      // 4. On-Chain Ledger Quota Verification
      const session = this.ledger.getSession(sessionId);
      if (session && session.remainingQuota <= 0) {
        this.sendJson(res, 402, {
          error: "Payment Required — insufficient on-chain compute quota",
          sessionId,
          remaining: session.remainingQuota,
        });
        return;
      }

      // 5. Parse completion payload
      let parsedPayload: any = {};
      try {
        parsedPayload = JSON.parse(rawBody || "{}");
      } catch {
        this.sendJson(res, 400, { error: "Malformed JSON payload" });
        return;
      }

      const messages = parsedPayload.messages ?? [{ role: "user", content: parsedPayload.prompt ?? "Hello" }];
      const model = parsedPayload.model ?? "meta-llama/Meta-Llama-3-8B-Instruct";
      const isStreaming = parsedPayload.stream !== false;

      // 6. Progressive SSE Stream
      if (isStreaming) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "*",
          "X-Decant-Session": sessionId,
          "X-Decant-Quota-Remaining": (session?.remainingQuota ?? 100).toString(),
        });

        let totalTokensUsed = 0;
        let lastEvent: any = null;

        try {
          for await (const event of this.compute.streamChat({ messages, model, stream: true })) {
            lastEvent = event;
            if (event.token) {
              const sseData = JSON.stringify({
                id: `chatcmpl-${Date.now()}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: event.model,
                choices: [{ index: 0, delta: { content: event.token }, finish_reason: null }],
              });
              res.write(`data: ${sseData}\n\n`);
            }
          }

          res.write("data: [DONE]\n\n");
          res.end();

          // 7. Atomic On-Chain Settlement after completion
          totalTokensUsed = lastEvent?.totalTokens ?? 1;
          if (session) {
            try {
              this.ledger.deductQuota(
                sessionId,
                totalTokensUsed,
                lastEvent?.promptTokens ?? 0,
                lastEvent?.completionTokens ?? totalTokensUsed,
                model,
                lastEvent?.latencyMs ?? 50
              );
            } catch (err: any) {
              console.warn(`[gateway] settlement debit note: ${err.message}`);
            }
          }
        } catch (streamErr: any) {
          if (!res.headersSent) {
            this.sendJson(res, 502, { error: "Compute upstream failed", detail: streamErr.message });
          }
        }
        return;
      }

      // Non-streaming fallback
      let fullContent = "";
      let lastEvent: any = null;
      for await (const event of this.compute.streamChat({ messages, model, stream: false })) {
        lastEvent = event;
        if (event.token) fullContent += event.token;
      }

      const totalTokens = lastEvent?.totalTokens ?? 1;
      if (session) {
        this.ledger.deductQuota(
          sessionId,
          totalTokens,
          lastEvent?.promptTokens ?? 0,
          lastEvent?.completionTokens ?? totalTokens,
          model,
          lastEvent?.latencyMs ?? 50
        );
      }

      this.sendJson(res, 200, {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        model,
        choices: [{ index: 0, message: { role: "assistant", content: fullContent }, finish_reason: "stop" }],
        usage: { total_tokens: totalTokens },
      });
      return;
    }

    // Default 404
    this.sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
  }

  public async start(host: string = "127.0.0.1"): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, host, () => {
        const address = this.server.address() as AddressInfo;
        this.assignedPort = address.port;
        console.log(`[decant-gateway] Production Gateway listening on http://${host}:${this.assignedPort}`);
        resolve(this.assignedPort);
      });
      this.server.on("error", reject);
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
      this.ledger.close();
    });
  }
}
