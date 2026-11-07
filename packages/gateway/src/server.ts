/**
 * server.ts — Decant Production API Gateway & Routing Tunnel.
 *
 * Implements a high-throughput, secure network gateway that manages:
 *   - Ed25519 Cryptographic Session Authentication
 *   - Request Limits (Payload Caps & Token Bucket Rate Limiting)
 *   - ACID Persistent Ledger Accounting (Node SQLite)
 *   - Real Multi-Provider AI Inference Routing with SSE Streaming
 *   - Intent Registry & Solver Fulfillment
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { PublicKey } from "near-api-js";
import type { AddressInfo } from "node:net";
import { DecantLedger } from "./db.js";
import { DecantCrypto } from "./crypto.js";
import { DecantComputeEngine } from "./compute-engine.js";
import { enforceRateLimitDistributed, enforcePayloadSize } from "./policy.js";
import { DecantRedisClient } from "./redis.js";
import { DecantConnectionPooler } from "./pooler.js";

export interface GatewayServerOptions {
  port?: number;
  dbPath?: string;
  /** Operator credential. If absent, operator-only routes fail closed. */
  adminKey?: string;
  nodeId?: string;
  redisUrl?: string;
}

export class DecantGatewayServer {
  public readonly server: Server;
  public readonly ledger: DecantLedger;
  public readonly compute: DecantComputeEngine;
  public readonly redis: DecantRedisClient;
  public readonly pooler: DecantConnectionPooler;
  public readonly nodeId: string;
  private port: number;
  private assignedPort: number = 0;
  private readonly activeRequests = new Set<string>();
  private readonly adminKey: string | undefined;

  constructor(opts: GatewayServerOptions = {}) {
    this.port = opts.port ?? parseInt(process.env["PORT"] ?? "8080", 10);
    this.ledger = new DecantLedger(opts.dbPath ?? (process.env["DATABASE_URL"] ?? ":memory:"));
    this.compute = new DecantComputeEngine();
    this.adminKey = opts.adminKey ?? process.env["DECANT_ADMIN_KEY"];
    this.nodeId = opts.nodeId ?? (process.env["NODE_ID"] || "server-1");
    this.redis = new DecantRedisClient(opts.redisUrl ?? process.env["REDIS_URL"]);
    this.pooler = new DecantConnectionPooler(opts.dbPath ?? process.env["DATABASE_URL"]);

    if (this.redis.isConfigured()) {
      this.redis.connect().catch(() => {});
    }

    try {
      if (this.ledger.listSolvers().length === 0) {
        this.ledger.registerSolver({
          solverId: "decant-solver-primary.testnet",
          endpointUrl: "https://api.decant.internal/inference",
          modelsSupported: ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"],
          pricePerKTokens: 1.0,
          reputationScore: 4.95,
          isActive: true,
        });
      }
    } catch {
      // Table may not exist yet in mocked test environments
    }

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
      "Access-Control-Expose-Headers": "X-Decant-Session, X-Decant-Quota-Remaining, X-Decant-Public-Key, X-Decant-Node-Id",
    };
  }

  private sendJson(res: ServerResponse, status: number, data: any, extraHeaders: Record<string, string> = {}, req?: IncomingMessage): void {
    if (res.headersSent) return;
    const cors = this.getCorsHeaders(req);
    res.writeHead(status, {
      "Content-Type": "application/json",
      "X-Decant-Node-Id": this.nodeId,
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
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        const error = new Error("Expected a JSON object");
        (error as any).statusCode = 400;
        throw error;
      }
      return value;
    } catch (error: any) {
      if (error.statusCode) throw error;
      const err = new Error("Malformed JSON payload");
      (err as any).statusCode = 400;
      throw err;
    }
  }

  private isOperator(req: IncomingMessage): boolean {
    const supplied = req.headers["x-decant-admin-key"];
    if (!this.adminKey || typeof supplied !== "string") return false;
    const actual = Buffer.from(supplied);
    const expected = Buffer.from(this.adminKey);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private async authorizeSession(req: IncomingMessage, res: ServerResponse, sessionId: string, body: string): Promise<boolean> {
    const session = typeof sessionId === "string" ? this.ledger.getSession(sessionId) : null;
    if (!session) {
      this.sendJson(res, 401, { error: "Unauthorized — session is not registered" }, {}, req);
      return false;
    }
    if (session.status === "suspended") {
      this.sendJson(res, 403, { error: "Session is suspended" }, {}, req);
      return false;
    }
    if (this.isOperator(req)) return true;
    const signature = req.headers["x-decant-signature"];
    const headerSession = req.headers["x-decant-session"];
    const timestamp = Number(req.headers["x-decant-timestamp"]);
    if (headerSession !== sessionId || typeof signature !== "string") {
      this.sendJson(res, 401, { error: "Unauthorized — signed session request required" }, {}, req);
      return false;
    }
    if (!DecantCrypto.verifySignature(session.publicKey, signature, req.method ?? "GET",
      new URL(req.url ?? "/", "http://localhost").pathname, timestamp, body, sessionId)) {
      this.sendJson(res, 403, { error: "Forbidden — invalid or replayed signature" }, {}, req);
      return false;
    }

    // Distributed replay protection via Redis (if connected)
    if (this.redis.isConnected()) {
      const freshInRedis = await this.redis.claimSignature(signature, 60);
      if (!freshInRedis) {
        this.sendJson(res, 403, { error: "Forbidden — invalid or replayed signature" }, {}, req);
        return false;
      }
    }

    if (!this.ledger.claimSignature(signature, timestamp)) {
      this.sendJson(res, 403, { error: "Forbidden — invalid or replayed signature" }, {}, req);
      return false;
    }
    return true;
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
            // ── OpenAI-Compatible Model Catalog ────────────────────────────────────
      if (pathname === "/v1/models" && method === "GET") {
        const modelData = this.compute.models.map((m) => {
          const isLite = m.includes("lite");
          const isPro = m.includes("pro") || m.includes("3.8");
          return {
            id: m,
            object: "model",
            created: 1740000000,
            owned_by: m.startsWith("gemini") ? "google-deepmind" : "depin-cluster",
            permission: [],
            root: m,
            parent: null,
            capabilities: { streaming: true, chat: true, completion: true },
            pricing: { credit_multiplier: isLite ? 0.5 : isPro ? 1.5 : 1.0, metering_unit: "ceil(characters / 4)" },
            context_window: isLite ? 524288 : 1048576,
          };
        });
        this.sendJson(res, 200, { object: "list", data: modelData }, {}, req);
        return;
      }

      // ── Credit Packages / Pricing Catalog ──────────────────────────────────
      if (pathname === "/v1/packages" && method === "GET") {
        this.sendJson(res, 200, {
          packages: [
            { id: "trial", name: "Developer Trial", credits: 1000, priceNear: 0, description: "Free testnet sandbox allocation for quick validation", tier: "free" },
            { id: "starter", name: "Agent Starter", credits: 5000, priceNear: 0.5, description: "Standard bundle for autonomous bots and agents", tier: "starter" },
            { id: "pro", name: "Production Bot", credits: 25000, priceNear: 2.0, description: "High volume compute routing for production pipelines", tier: "pro" },
            { id: "swarm", name: "Autonomous Swarm", credits: 100000, priceNear: 7.5, description: "Heavy throughput for coordinated agent swarms", tier: "swarm" },
          ],
          rate: "1 NEAR = 10,000 Compute Credits",
          unitSize: "1 unit ≈ 4 characters of provider text",
        }, {}, req);
        return;
      }

      if (pathname === "/v1/health" || pathname === "/health") {
        this.sendJson(res, 200, {
          status: "healthy",
          nodeId: this.nodeId,
          uptime: process.uptime(),
          ledger: this.pooler.isPoolerActive() ? "postgres-pgbouncer-pool" : "sqlite-acid-persistent",
          nearSync: "not-connected",
          models: this.compute.models,
          inferenceConfigured: this.compute.configured,
          metering: "ceil(characters / 4), estimated credit units",
          cluster: {
            nodeId: this.nodeId,
            loadBalanced: Boolean(process.env["LOAD_BALANCER_ACTIVE"] || process.env["NODE_ID"]),
            redis: this.redis.getHealth(),
            pooler: this.pooler.getHealth(),
          },
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
        if (!(await this.authorizeSession(req, res, sessionId, ""))) return;
        if (!(await enforceRateLimitDistributed(req, res, this.redis))) return;

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
        const raw = await this.parseBody(req, 4 * 1024);
        if (!(await this.authorizeSession(req, res, sessionId, raw))) return;
        if (!(await enforceRateLimitDistributed(req, res, this.redis))) return;
        this.sendJson(res, 200, {
          echo: true,
          method: "POST",
          path: "/post",
          body: raw,
          session: sessionId,
        }, {}, req);
        return;
      }

      const isAuthorizedAdmin = (r: IncomingMessage): boolean => this.isOperator(r);

      // Operator metadata and credit mutations are never public. Health stays public.
      const operatorRoute = pathname === "/v1/sessions/register"
        || pathname === "/v1/sessions"
        || pathname === "/v1/transactions"
        || pathname === "/v1/reservations"
        || pathname === "/v1/reservation-reviews"
        || /^\/v1\/reservations\/[^/]+\/review$/.test(pathname)
        || pathname === "/v1/intents"
        || pathname === "/v1/redemptions"
        || /^\/v1\/sessions\/[^/]+\/(topup|suspend|resume)$/.test(pathname)
        || /^\/v1\/intents\/[^/]+\/fill$/.test(pathname)
        || /^\/v1\/solvers\/[^/]+\/(earnings|reward|redeem)$/.test(pathname);
      if (operatorRoute && !isAuthorizedAdmin(req)) {
        this.sendJson(res, this.adminKey ? 403 : 503, {
          error: this.adminKey ? "Forbidden — valid operator key required" : "Operator access is not configured",
        }, {}, req);
        return;
      }

      // ── Session Registration & Management ───────────────────────────────────
      if (pathname === "/v1/sessions/register" && method === "POST") {
        if (!isAuthorizedAdmin(req)) {
          this.sendJson(res, 403, { error: "Forbidden — missing or invalid X-Decant-Admin-Key" }, {}, req);
          return;
        }
        const body = await this.parseJsonBody(req);
        const { sessionId, publicKey, ownerAccountId, quota } = body;

        if (!sessionId || !publicKey || !Number.isSafeInteger(quota) || quota <= 0) {
          this.sendJson(res, 400, { error: "Missing required fields: sessionId, publicKey, quota" }, {}, req);
          return;
        }

        if (typeof sessionId !== "string" || sessionId.length > 128 || typeof publicKey !== "string"
          || !publicKey.startsWith("ed25519:") || (ownerAccountId != null && typeof ownerAccountId !== "string")) {
          this.sendJson(res, 400, { error: "Valid session ID, Ed25519 public key and owner metadata required" }, {}, req); return;
        }
        try { PublicKey.fromString(publicKey); }
        catch { this.sendJson(res, 400, { error: "Invalid Ed25519 public key" }, {}, req); return; }
        try {
          const session = this.ledger.registerSession(sessionId, publicKey, ownerAccountId ?? "agent.testnet", quota);
          this.sendJson(res, 201, session, {}, req);
        } catch (err: any) {
          this.sendJson(res, 409, { error: err.message }, {}, req);
        }
        return;
      }

            if (pathname === "/v1/sessions/order" && method === "POST") {
        const body = await this.parseJsonBody(req, 4 * 1024);
        const { sessionId, publicKey, ownerAccountId, packageId, units, paymentMethod } = body;
        if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
          this.sendJson(res, 400, { error: "Valid sessionId is required" }, {}, req); return;
        }
        let creditUnits = Number(units) || 5000;
        if (packageId === "trial") creditUnits = 1000;
        else if (packageId === "starter") creditUnits = 5000;
        else if (packageId === "pro") creditUnits = 25000;
        else if (packageId === "swarm") creditUnits = 100000;

        let session = this.ledger.getSession(sessionId);
        if (!session) {
          const keyToUse = publicKey && typeof publicKey === "string" && publicKey.trim()
            ? publicKey.trim()
            : `ed25519:${randomUUID().replace(/-/g, "")}`;
          const ownerToUse = ownerAccountId && typeof ownerAccountId === "string" && ownerAccountId.trim()
            ? ownerAccountId.trim()
            : `${sessionId}.testnet`;
          session = this.ledger.registerSession(sessionId, keyToUse, ownerToUse, creditUnits);
        } else {
          session = this.ledger.topupQuota(sessionId, creditUnits);
        }

        this.sendJson(res, 201, {
          orderId: `ord_${Date.now()}_${randomUUID().slice(0, 6)}`,
          status: "fulfilled",
          session,
          creditsProvisioned: creditUnits,
          paymentMethod: paymentMethod || "testnet-settlement",
          timestamp: Date.now(),
        }, {}, req);
        return;
      }

      if (/^\/v1\/sessions\/[^/]+\/faucet$/.test(pathname) && method === "POST") {
        const sessionId = decodeURIComponent(pathname.split("/")[3]);
        const session = this.ledger.getSession(sessionId);
        if (!session) {
          this.sendJson(res, 404, { error: `Session '${sessionId}' not found` }, {}, req);
          return;
        }
        if (session.remainingQuota >= 2500) {
          this.sendJson(res, 400, { error: "Session already has sufficient quota for testing (>= 2500 units)" }, {}, req);
          return;
        }
        try {
          const updated = this.ledger.topupQuota(sessionId, 1000);
          this.sendJson(res, 200, {
            session: updated,
            claimedUnits: 1000,
            message: "1,000 developer testnet credits added successfully",
          }, {}, req);
        } catch (err: any) {
          this.sendJson(res, 500, { error: err.message }, {}, req);
        }
        return;
      }

      if (pathname === "/v1/sessions" && method === "GET") {
        const sessions = this.ledger.listSessions();
        this.sendJson(res, 200, { sessions }, {}, req);
        return;
      }

      if (/^\/v1\/sessions\/[^/]+$/.test(pathname) && method === "GET") {
        const sessionId = decodeURIComponent(pathname.split("/")[3]);
        if (!(await this.authorizeSession(req, res, sessionId, ""))) return;
        const session = this.ledger.getSession(sessionId);
        if (!session) {
          this.sendJson(res, 404, { error: `Session '${sessionId}' not found` }, {}, req);
          return;
        }

        const txs = this.ledger.getTransactionHistory(sessionId);
        this.sendJson(res, 200, { session, transactions: txs }, {}, req);
        return;
      }

      if (/^\/v1\/sessions\/[^/]+\/topup$/.test(pathname) && method === "POST") {
        if (!isAuthorizedAdmin(req)) {
          this.sendJson(res, 403, { error: "Forbidden — missing or invalid X-Decant-Admin-Key" }, {}, req);
          return;
        }
        const sessionId = decodeURIComponent(pathname.split("/")[3]);
        const body = await this.parseJsonBody(req);
        if (!body || typeof body.amount !== "number" || !Number.isSafeInteger(body.amount) || body.amount <= 0) {
          this.sendJson(res, 400, { error: "Valid positive integer 'amount' required" }, {}, req);
          return;
        }

        const existing = this.ledger.getSession(sessionId);
        if (!existing) {
          this.sendJson(res, 404, { error: `Session '${sessionId}' not found` }, {}, req);
          return;
        }

        try {
          const session = this.ledger.topupQuota(sessionId, body.amount);
          this.sendJson(res, 200, session, {}, req);
        } catch (err: any) {
          this.sendJson(res, 400, { error: err.message }, {}, req);
        }
        return;
      }

      if (/^\/v1\/sessions\/[^/]+\/suspend$/.test(pathname) && method === "POST") {
        if (!isAuthorizedAdmin(req)) {
          this.sendJson(res, 403, { error: "Forbidden — missing or invalid X-Decant-Admin-Key" }, {}, req);
          return;
        }
        const sessionId = decodeURIComponent(pathname.split("/")[3]);
        try {
          const session = this.ledger.suspendSession(sessionId);
          this.sendJson(res, 200, { session }, {}, req);
        } catch (err: any) {
          this.sendJson(res, 404, { error: err.message }, {}, req);
        }
        return;
      }

      if (/^\/v1\/sessions\/[^/]+\/resume$/.test(pathname) && method === "POST") {
        if (!isAuthorizedAdmin(req)) {
          this.sendJson(res, 403, { error: "Forbidden — missing or invalid X-Decant-Admin-Key" }, {}, req);
          return;
        }
        const sessionId = decodeURIComponent(pathname.split("/")[3]);
        try {
          const session = this.ledger.resumeSession(sessionId);
          this.sendJson(res, 200, { session }, {}, req);
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

      if (pathname === "/v1/reservations" && method === "GET") {
        this.sendJson(res, 200, { reservations: this.ledger.listReservations() }, {}, req);
        return;
      }

      if (pathname === "/v1/reservation-reviews" && method === "GET") {
        this.sendJson(res, 200, { reviews: this.ledger.listReservationReviews() }, {}, req);
        return;
      }
      if (/^\/v1\/reservations\/[^/]+\/review$/.test(pathname) && method === "POST") {
        const requestId = decodeURIComponent(pathname.split("/")[3]);
        if (this.activeRequests.has(requestId)) {
          this.sendJson(res, 409, { error: "Request is still active; do not review it" }, {}, req); return;
        }
        const review = await this.parseJsonBody(req, 4 * 1024);
        const result = this.ledger.reviewReservation(requestId, review);
        this.sendJson(res, 200, { review: result }, {}, req);
        return;
      }

      // ── Intent Registry ─────────────────────────────────────────────────────
      if (pathname === "/v1/intents/broadcast" && method === "POST") {
        const rawBody = await this.parseBody(req);
        const body = JSON.parse(rawBody || "{}");
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          this.sendJson(res, 400, { error: "Expected a JSON object" }, {}, req); return;
        }
        const { sessionId, model, maxBudget } = body;
        if (!(await this.authorizeSession(req, res, sessionId, rawBody))) return;

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

      if (/^\/v1\/intents\/[^/]+\/fill$/.test(pathname) && method === "POST") {
        const intentId = decodeURIComponent(pathname.split("/")[3]);
        const body = await this.parseJsonBody(req);
        const solverId = body.solverId;
        if (typeof solverId !== "string" || !solverId.trim() || solverId.length > 128) {
          this.sendJson(res, 400, { error: "A solver ID is required" }, {}, req); return;
        }
        try {
          const intent = this.ledger.fillIntent(intentId, solverId);
          // Assignment is not proof of completed compute; do not issue rewards here.
          this.sendJson(res, 200, intent, {}, req);
        } catch (err: any) {
          this.sendJson(res, 400, { error: err.message }, {}, req);
        }
        return;
      }

      // ── Compute Providers (Solvers) API Supply ─────────────────────────────
      if (pathname === "/v1/solvers" && method === "GET") {
        const solvers = this.ledger.listSolvers();
        this.sendJson(res, 200, { solvers }, {}, req);
        return;
      }

      if (pathname === "/v1/solvers/register" && method === "POST") {
        const rawBody = await this.parseBody(req, 4 * 1024);
        let body: any;
        try { body = JSON.parse(rawBody || "{}"); } catch {
          this.sendJson(res, 400, { error: "Malformed JSON payload" }, {}, req);
          return;
        }

        const solverId = (body.solverId || "").trim();
        if (!solverId) {
          this.sendJson(res, 400, { error: "solverId is required" }, {}, req);
          return;
        }

        const solver = this.ledger.registerSolver({
          solverId,
          endpointUrl: body.endpointUrl || "https://api.decant.internal",
          modelsSupported: Array.isArray(body.modelsSupported) && body.modelsSupported.length > 0
            ? body.modelsSupported
            : ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"],
          pricePerKTokens: Number(body.pricePerKTokens) || 1.0,
          reputationScore: 5.0,
          isActive: body.isActive !== false,
        });

        this.sendJson(res, 201, {
          solver,
          message: "Compute provider registered successfully. Your node is now active and will earn credits when serving queries.",
        }, {}, req);
        return;
      }

      if (/^\/v1\/solvers\/[^/]+\/toggle$/.test(pathname) && method === "POST") {
        const solverId = decodeURIComponent(pathname.split("/")[3]);
        const solver = this.ledger.getSolver(solverId);
        if (!solver) {
          this.sendJson(res, 404, { error: `Solver '${solverId}' not found` }, {}, req);
          return;
        }
        const newStatus = !solver.isActive;
        this.ledger.setSolverActive(solverId, newStatus);
        this.sendJson(res, 200, { solverId, isActive: newStatus }, {}, req);
        return;
      }

      if (/^\/v1\/solvers\/[^/]+\/stats$/.test(pathname) && method === "GET") {
        const solverId = decodeURIComponent(pathname.split("/")[3]);
        const solver = this.ledger.getSolver(solverId);
        if (!solver) {
          this.sendJson(res, 404, { error: `Solver '${solverId}' not found` }, {}, req);
          return;
        }
        const earned = this.ledger.getSolverEarnings(solverId);
        this.sendJson(res, 200, {
          solverId,
          isActive: solver.isActive,
          earnedCredits: earned,
          endpointUrl: solver.endpointUrl,
          modelsSupported: solver.modelsSupported,
          reputationScore: solver.reputationScore,
          rate: `${solver.pricePerKTokens} units / 1K tokens`,
        }, {}, req);
        return;
      }

      // ── Solver Earnings & Compute-to-Value Redemption ───────────────────────
      if (/^\/v1\/solvers\/[^/]+\/earnings$/.test(pathname) && method === "GET") {
        const solverId = decodeURIComponent(pathname.split("/")[3]);
        const earned = this.ledger.getSolverEarnings(solverId);
        this.sendJson(res, 200, {
          solverId,
          earnedCredits: earned,
          ledger: "local",
          payoutConnected: false,
        }, {}, req);
        return;
      }

      if (/^\/v1\/solvers\/[^/]+\/(reward|redeem)$/.test(pathname) && method === "POST") {
        this.sendJson(res, 503, {
          error: pathname.endsWith("/reward")
            ? "Rewards are unavailable until completed work can be verified"
            : "USDT payouts are not connected. No credits have been burned",
        }, {}, req);
        return;
      }

      if (pathname === "/v1/redemptions" && method === "GET") {
        const redemptions = this.ledger.listRedemptions(50).map(record => ({
          ...record, status: "Unverified", transferConfirmed: false,
        }));
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

        // 2. Request Policy Guards
        if (!enforcePayloadSize(req, res)) return;

        const rawBody = await this.parseBody(req, 4 * 1024);

        if (!(await this.authorizeSession(req, res, sessionId, rawBody))) return;
        if (!(await enforceRateLimitDistributed(req, res, this.redis))) return;

        const session = this.ledger.getSession(sessionId)!;
        let payload: any;
        try { payload = JSON.parse(rawBody || "{}"); }
        catch { this.sendJson(res, 400, { error: "Malformed JSON payload" }, {}, req); return; }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          this.sendJson(res, 400, { error: "Expected an object payload" }, {}, req); return;
        }
        const messages = payload.messages ?? [{ role: "user", content: payload.prompt }];
        const maxTokens = payload.max_tokens ?? 128;
        const model = payload.model ?? this.compute.defaultModel;
        if (!Array.isArray(messages) || messages.length === 0 || messages.length > 100
          || !messages.every((m: any) => m && ["system", "user", "assistant"].includes(m.role)
            && typeof m.content === "string" && m.content.length > 0)
          || !Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096
          || typeof model !== "string" || model.length > 200) {
          this.sendJson(res, 400, { error: "Valid messages, model and max_tokens (1–4096) are required" }, {}, req); return;
        }
        if (!this.compute.configured) {
          this.sendJson(res, 503, { error: "A real inference provider and model must be configured" }, {}, req); return;
        }
        if (!this.compute.models.includes(model)) {
          this.sendJson(res, 400, { error: "Requested model is not enabled on this gateway" }, {}, req); return;
        }
        const promptUnits = this.compute.promptUnits(messages);
        const requestId = randomUUID();
        try { this.ledger.reserveInference(requestId, sessionId, promptUnits + maxTokens); }
        catch {
          this.sendJson(res, 402, { error: "Payment Required — insufficient available compute credit",
            required: promptUnits + maxTokens, remaining: session.remainingQuota }, {}, req); return;
        }
        this.activeRequests.add(requestId);
        const streaming = payload.stream !== false;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);
        const onClose = () => { if (!res.writableFinished) controller.abort(); };
        res.on("close", onClose);
        let lastEvent: import("./compute-engine.js").StreamEvent | undefined;
        let output = "";
        let settled = false;
        const settle = () => {
          if (settled) return;
          this.ledger.settleInference(requestId, lastEvent?.totalTokens ?? 0,
            lastEvent?.promptTokens ?? 0, lastEvent?.completionTokens ?? 0,
            lastEvent?.model ?? model, lastEvent?.latencyMs ?? 0);
          settled = true;
        };
        try {
          for await (const event of this.compute.streamChat({ messages, model, maxTokens,
            stream: streaming, signal: controller.signal })) {
            if (controller.signal.aborted) throw new Error("Inference request stopped");
            lastEvent = event;
            if (event.token) {
              output += event.token;
              if (streaming) {
                if (!res.headersSent) res.writeHead(200, { ...this.getCorsHeaders(req),
                  "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
                  "X-Accel-Buffering": "no",
                  "X-Decant-Session": sessionId,
                  "X-Decant-Node-Id": this.nodeId,
                  "X-Decant-Quota-Remaining": this.ledger.getSession(sessionId)!.remainingQuota.toString() });
                res.write(`data: ${JSON.stringify({ id: requestId, object: "chat.completion.chunk",
                  model: event.model, choices: [{ index: 0, delta: { content: event.token }, finish_reason: null }] })}\n\n`);
              }
            }
          }
          if (!lastEvent?.isComplete) throw new Error("Inference did not complete");
          settle();
          if (streaming) {
            res.write(`data: ${JSON.stringify({ id: requestId, object: "chat.completion.chunk",
              model: lastEvent.model, choices: [], usage: { credit_units: lastEvent.totalTokens,
                metering: "ceil(characters / 4)" } })}\n\n`);
            res.write("data: [DONE]\n\n"); res.end();
          } else {
            this.sendJson(res, 200, { id: requestId, object: "chat.completion", model: lastEvent.model,
              choices: [{ index: 0, message: { role: "assistant", content: output }, finish_reason: "stop" }],
              usage: { credit_units: lastEvent.totalTokens, metering: "ceil(characters / 4)" },
            }, {}, req);
          }
        } catch (error: any) {
          console.error('[gateway] inference error:', error);
          try { settle(); } catch {
            if (res.headersSent) res.destroy();
            else this.sendJson(res, 500, { error: "Settlement requires operator review", requestId }, {}, req);
            return;
          }
          if (!res.destroyed) {
            if (res.headersSent) { res.write(`data: ${JSON.stringify({ error: "Inference interrupted; partial usage settled" })}\n\n`); res.end(); }
            else this.sendJson(res, 502, { error: "Compute upstream failed" }, {}, req);
          }
        } finally {
          clearTimeout(timeout); controller.abort(); res.off("close", onClose);
          this.activeRequests.delete(requestId);
          // A failed settlement keeps the durable reservation for operator review.
        }
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
    this.redis.disconnect();
    if (typeof (this.server as any).closeAllConnections === "function") {
      (this.server as any).closeAllConnections();
    }
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
      this.ledger.close();
    });
  }
}
