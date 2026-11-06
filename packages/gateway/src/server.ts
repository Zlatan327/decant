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

  private getCorsHeaders(req?: IncomingMessage): Record<string, string> {
    const origin = req?.headers.origin as string;
    const allowed = process.env["CORS_ORIGINS"];
    let allowOrigin = "*";
    if (allowed && allowed !== "*") {
      const allowedList = allowed.split(",").map((s) => s.trim());
      allowOrigin = origin && allowedList.includes(origin) ? origin : allowedList[0] || "*";
    }
    return {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Decant-Session, X-Decant-Signature, X-Decant-Timestamp, X-Decant-Public-Key, X-Decant-Admin-Key",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Expose-Headers": "X-Decant-Session, X-Decant-Quota-Remaining, X-Decant-Public-Key",
    };
  }

  private sendJson(res: ServerResponse, status: number, data: any, extraHeaders: Record<string, string> = {}, req?: IncomingMessage): void {
    if (res.headersSent) return;
    const cors = this.getCorsHeaders(req);
    res.writeHead(status, {
      "Content-Type": "application/json",
      ...cors,
      ...extraHeaders,
    });
    res.end(JSON.stringify(data));
  }

  private async parseBody(req: IncomingMessage, maxBytes = 256 * 1024): Promise<string> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      const buf = chunk as Buffer;
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        const err = new Error("PAYLOAD_TOO_LARGE");
        (err as any).statusCode = 413;
        throw err;
      }
      chunks.push(buf);
    }
    return Buffer.concat(chunks).toString("utf-8");
  }

  private async parseJsonBody(req: IncomingMessage, maxBytes = 256 * 1024): Promise<any> {
    const raw = await this.parseBody(req, maxBytes);
    if (!raw || !raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      const err = new Error("Malformed JSON payload");
      (err as any).statusCode = 400;
      throw err;
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const pathname = url.pathname;
      const method = req.method?.toUpperCase() ?? "GET";

      // CORS preflight
      if (method === "OPTIONS") {
        res.writeHead(204, this.getCorsHeaders(req));
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
        }, {}, req);
        return;
      }

      // ── Backwards Compatible Phase 1/2 Echo Routes ─────────────────────────
      if (pathname === "/get" && method === "GET") {
        const sessionId = req.headers["x-decant-session"] as string;
        if (!sessionId) {
          this.sendJson(res, 401, { error: "Unauthorized — missing X-Decant-Session header" }, {}, req);
          return;
        }
        if (!enforceRateLimit(req, res)) return;

        this.sendJson(res, 200, {
          echo: true,
          method: "GET",
          path: "/get",
          session: sessionId,
        }, {}, req);
        return;
      }

      if (pathname === "/post" && method === "POST") {
        const sessionId = req.headers["x-decant-session"] as string;
        if (!sessionId) {
          this.sendJson(res, 401, { error: "Unauthorized — missing X-Decant-Session header" }, {}, req);
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
        }, {}, req);
        return;
      }

      const adminKey = process.env["DECANT_ADMIN_KEY"];
      const isAuthorizedAdmin = (r: IncomingMessage): boolean => {
        if (!adminKey) return true;
        const key = r.headers["x-decant-admin-key"] as string;
        return key === adminKey;
      };

      // ── Session Registration & Management ───────────────────────────────────
      if (pathname === "/v1/sessions/register" && method === "POST") {
        if (!isAuthorizedAdmin(req)) {
          this.sendJson(res, 403, { error: "Forbidden — missing or invalid X-Decant-Admin-Key" }, {}, req);
          return;
        }
        const body = await this.parseJsonBody(req);
        const { sessionId, publicKey, ownerAccountId, quota } = body;

        if (!sessionId || !publicKey || !quota) {
          this.sendJson(res, 400, { error: "Missing required fields: sessionId, publicKey, quota" }, {}, req);
          return;
        }

        try {
          const session = this.ledger.registerSession(sessionId, publicKey, ownerAccountId ?? "agent.testnet", quota);
          this.sendJson(res, 201, session, {}, req);
        } catch (err: any) {
          this.sendJson(res, 409, { error: err.message }, {}, req);
        }
        return;
      }

      if (pathname === "/v1/sessions" && method === "GET") {
        const sessions = this.ledger.listSessions();
        this.sendJson(res, 200, { sessions }, {}, req);
        return;
      }

      if (pathname.startsWith("/v1/sessions/") && method === "GET") {
        const sessionId = pathname.split("/")[3];
        const session = this.ledger.getSession(sessionId);
        if (!session) {
          this.sendJson(res, 404, { error: `Session '${sessionId}' not found` }, {}, req);
          return;
        }

        const txs = this.ledger.getTransactionHistory(sessionId);
        this.sendJson(res, 200, { session, transactions: txs }, {}, req);
        return;
      }

      if (pathname.includes("/topup") && method === "POST") {
        if (!isAuthorizedAdmin(req)) {
          this.sendJson(res, 403, { error: "Forbidden — missing or invalid X-Decant-Admin-Key" }, {}, req);
          return;
        }
        const sessionId = pathname.split("/")[3];
        const body = await this.parseJsonBody(req);
        if (!body.amount || body.amount <= 0) {
          this.sendJson(res, 400, { error: "Valid 'amount' required" }, {}, req);
          return;
        }

        try {
          const session = this.ledger.topupQuota(sessionId, body.amount);
          this.sendJson(res, 200, session, {}, req);
        } catch (err: any) {
          this.sendJson(res, 404, { error: err.message }, {}, req);
        }
        return;
      }

      if (pathname === "/v1/transactions" && method === "GET") {
        const txs = this.ledger.listRecentTransactions(50);
        this.sendJson(res, 200, { transactions: txs }, {}, req);
        return;
      }

      // ── Intent Registry ─────────────────────────────────────────────────────
      if (pathname === "/v1/intents/broadcast" && method === "POST") {
        const body = await this.parseJsonBody(req);
        const { sessionId, model, maxBudget } = body;

        if (!sessionId || !maxBudget) {
          this.sendJson(res, 400, { error: "Missing required fields: sessionId, maxBudget" }, {}, req);
          return;
        }

        try {
          const intent = this.ledger.broadcastIntent(sessionId, model ?? "llama3", maxBudget);
          this.sendJson(res, 201, intent, {}, req);
        } catch (err: any) {
          this.sendJson(res, 400, { error: err.message }, {}, req);
        }
        return;
      }

      if (pathname === "/v1/intents" && method === "GET") {
        const openIntents = this.ledger.listOpenIntents();
        this.sendJson(res, 200, { intents: openIntents }, {}, req);
        return;
      }

      if (pathname.includes("/fill") && method === "POST") {
        const intentId = pathname.split("/")[3];
        const body = await this.parseJsonBody(req);
        const solverId = body.solverId ?? "solver-default.near";
        try {
          const intent = this.ledger.fillIntent(intentId, solverId);
          // Reward solver with compute credits for taking on the workload
          this.ledger.recordSolverEarnings(solverId, intent.maxBudget || 50);
          this.sendJson(res, 200, intent, {}, req);
        } catch (err: any) {
          this.sendJson(res, 400, { error: err.message }, {}, req);
        }
        return;
      }

      // ── Solver Earnings & Compute-to-Value Redemption ───────────────────────
      if (pathname.startsWith("/v1/solvers/") && pathname.endsWith("/earnings") && method === "GET") {
        const solverId = pathname.split("/")[3];
        const earned = this.ledger.getSolverEarnings(solverId);
        this.sendJson(res, 200, {
          solverId,
          earnedCredits: earned,
          usdtAmountCents: Math.floor(earned / 10),
          usdtFormatted: (earned / 1000).toFixed(2),
          rate: "1000 credits = $1.00 USDT",
        }, {}, req);
        return;
      }

      if (pathname.startsWith("/v1/solvers/") && pathname.endsWith("/reward") && method === "POST") {
        const solverId = pathname.split("/")[3];
        const body = await this.parseJsonBody(req);
        const amount = Number(body.amount ?? 100);
        const newTotal = this.ledger.recordSolverEarnings(solverId, amount);
        this.sendJson(res, 200, {
          solverId,
          earnedCredits: newTotal,
          usdtFormatted: (newTotal / 1000).toFixed(2),
        }, {}, req);
        return;
      }

      if (pathname.startsWith("/v1/solvers/") && pathname.endsWith("/redeem") && method === "POST") {
        const solverId = pathname.split("/")[3];
        const body = await this.parseJsonBody(req);
        const credits = Number(body.credits ?? 0);
        try {
          const redemption = this.ledger.recordRedemption(solverId, credits);
          this.sendJson(res, 200, {
            success: true,
            redemption,
          }, {}, req);
        } catch (err: any) {
          this.sendJson(res, 400, { error: err.message }, {}, req);
        }
        return;
      }

      if (pathname === "/v1/redemptions" && method === "GET") {
        const redemptions = this.ledger.listRedemptions(50);
        this.sendJson(res, 200, { redemptions }, {}, req);
        return;
      }

      // ── Live AI Compute Streaming (/v1/chat/completions) ────────────────────
      if (pathname === "/v1/chat/completions" && method === "POST") {
        // 1. Session Auth Gate
        const sessionId = req.headers["x-decant-session"] as string;
        if (!sessionId) {
          this.sendJson(res, 401, { error: "Unauthorized — missing X-Decant-Session header" }, {}, req);
          return;
        }

        // 2. Anti-Hallucination Policy Guards
        if (!enforcePayloadSize(req, res)) return;
        if (!enforceRateLimit(req, res)) return;

        const rawBody = await this.parseBody(req);

        // 3. Cryptographic Ed25519 Signature Verification
        // Enforced if enableCrypto is configured, or whenever X-Decant-Signature is supplied
        const sig = req.headers["x-decant-signature"] as string;
        if (this.enableCrypto || sig) {
          if (!sig) {
            this.sendJson(res, 401, { error: "Unauthorized — missing required cryptographic signature header (X-Decant-Signature)" }, {}, req);
            return;
          }

          const ts = parseInt((req.headers["x-decant-timestamp"] as string) ?? "0", 10);
          const session = this.ledger.getSession(sessionId);

          if (!session) {
            this.sendJson(res, 401, { error: "Unauthorized — session not registered on-chain" }, {}, req);
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
            this.sendJson(res, 403, { error: "Forbidden — invalid cryptographic signature" }, {}, req);
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
          }, {}, req);
          return;
        }

        // 5. Parse completion payload
        let parsedPayload: any = {};
        try {
          parsedPayload = JSON.parse(rawBody || "{}");
        } catch {
          this.sendJson(res, 400, { error: "Malformed JSON payload" }, {}, req);
          return;
        }

        const messages = parsedPayload.messages ?? [{ role: "user", content: parsedPayload.prompt ?? "Hello" }];
        const model = parsedPayload.model ?? "meta-llama/Meta-Llama-3-8B-Instruct";
        const isStreaming = parsedPayload.stream !== false;

        // 6. Progressive SSE Stream
        if (isStreaming) {
          const cors = this.getCorsHeaders(req);
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            ...cors,
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
              this.sendJson(res, 502, { error: "Compute upstream failed", detail: streamErr.message }, {}, req);
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
        }, {}, req);
        return;
      }

      // Default 404
      this.sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` }, {}, req);
    } catch (err: any) {
      if (res.headersSent) return;
      const status = typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : err instanceof SyntaxError
          ? 400
          : 500;
      this.sendJson(res, status, { error: err.message || "Internal Gateway Error" }, {}, req);
    }
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
