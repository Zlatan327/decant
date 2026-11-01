/**
 * sandbox-server.ts — Deterministic NEAR Sandbox JSON-RPC 2.0 Server.
 *
 * Implements the exact NEAR JSON-RPC 2.0 wire protocol over HTTP for local development
 * and integration testing across platforms (Windows, Linux, macOS).
 *
 * Exposes:
 *   - POST / with JSON-RPC 2.0 payload
 *   - method: "status" (Node health check)
 *   - method: "query" with request_type: "call_function" (Deterministic view_method execution)
 *   - method: "broadcast_tx_commit" (On-chain state mutation: register, consume, topup, intent)
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

export interface QuotaEntry {
  session_id: string;
  owner: string;
  total: number;
  remaining: number;
}

export interface IntentEntry {
  intent_id: string;
  session_id: string;
  payload: string;
  status: "Open" | "Filled" | "Expired";
  solver_id: string | null;
  created_at: number;
}

export class NearSandboxServer {
  private server: Server | null = null;
  private port: number = 0;

  // On-chain state matching packages/contracts/src/lib.rs
  public quotas = new Map<string, QuotaEntry>();
  public intents = new Map<string, IntentEntry>();
  public intentCounter = 0;
  public contractOwner: string = "owner.test.near";

  constructor(public readonly contractId: string = "decant.test.near") {}

  // ─── Contract Logic (Deterministic State Transitions) ─────────────────────

  public registerSession(sessionId: string, quota: number, caller: string = "alice.test.near"): QuotaEntry {
    if (this.quotas.has(sessionId)) {
      throw new Error("Session already registered");
    }
    const entry: QuotaEntry = {
      session_id: sessionId,
      owner: caller,
      total: quota,
      remaining: quota,
    };
    this.quotas.set(sessionId, entry);
    return entry;
  }

  public consumeQuota(sessionId: string, amount: number): QuotaEntry {
    const entry = this.quotas.get(sessionId);
    if (!entry) {
      throw new Error("Session not found");
    }
    if (entry.remaining < amount) {
      throw new Error(`Insufficient quota: ${entry.remaining} remaining, ${amount} requested`);
    }
    entry.remaining -= amount;
    return entry;
  }

  public topupQuota(sessionId: string, amount: number): QuotaEntry {
    const entry = this.quotas.get(sessionId);
    if (!entry) {
      throw new Error("Session not found");
    }
    entry.remaining += amount;
    entry.total += amount;
    return entry;
  }

  public getQuota(sessionId: string): QuotaEntry {
    const entry = this.quotas.get(sessionId);
    if (!entry) {
      throw new Error("Session not found");
    }
    return entry;
  }

  public broadcastIntent(sessionId: string, payload: string): string {
    const quota = this.getQuota(sessionId);
    if (quota.remaining <= 0) {
      throw new Error("No remaining quota to broadcast intent");
    }
    this.intentCounter += 1;
    const intentId = `intent-${this.intentCounter}`;
    const intent: IntentEntry = {
      intent_id: intentId,
      session_id: sessionId,
      payload,
      status: "Open",
      solver_id: null,
      created_at: Date.now() * 1_000_000,
    };
    this.intents.set(intentId, intent);
    return intentId;
  }

  public fillIntent(intentId: string, solverId: string = "solver.test.near"): IntentEntry {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error("Intent not found");
    }
    if (intent.status !== "Open") {
      throw new Error(`Intent is not open — current status: ${intent.status}`);
    }
    intent.status = "Filled";
    intent.solver_id = solverId;
    return intent;
  }

  public getIntent(intentId: string): IntentEntry {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error("Intent not found");
    }
    return intent;
  }

  public listOpenIntents(): IntentEntry[] {
    return Array.from(this.intents.values()).filter((i) => i.status === "Open");
  }

  // ─── JSON-RPC 2.0 Dispatcher ──────────────────────────────────────────────

  private handleRpc(body: any): any {
    const { id, method, params } = body;

    if (method === "status") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          chain_id: "sandbox",
          sync_info: { latest_block_height: 42, syncing: false },
          version: { version: "sandbox-1.0.0", build: "decant-deterministic" },
        },
      };
    }

    if (method === "query") {
      const { request_type, account_id, method_name, args_base64 } = params || {};
      if (request_type === "call_function") {
        const rawArgs = args_base64 ? Buffer.from(args_base64, "base64").toString("utf-8") : "{}";
        const args = JSON.parse(rawArgs);

        try {
          let callResult: any;
          if (method_name === "get_quota") {
            callResult = this.getQuota(args.session_id);
          } else if (method_name === "get_intent") {
            callResult = this.getIntent(args.intent_id);
          } else if (method_name === "list_open_intents") {
            callResult = this.listOpenIntents();
          } else {
            throw new Error(`Unknown contract view method: ${method_name}`);
          }

          const resultBytes = Array.from(Buffer.from(JSON.stringify(callResult), "utf-8"));
          return {
            jsonrpc: "2.0",
            id,
            result: {
              result: resultBytes,
              logs: [],
              block_height: 42,
            },
          };
        } catch (err: any) {
          return {
            jsonrpc: "2.0",
            id,
            error: {
              name: "HANDLER_ERROR",
              cause: { name: "GuestPanic" },
              message: err.message,
            },
          };
        }
      }
    }

    if (method === "broadcast_tx_commit") {
      const { contract_id, method_name, args } = params || {};
      try {
        let txResult: any;
        if (method_name === "register_session") {
          txResult = this.registerSession(args.session_id, args.quota, args.caller);
        } else if (method_name === "consume_quota") {
          txResult = this.consumeQuota(args.session_id, args.amount);
        } else if (method_name === "topup_quota") {
          txResult = this.topupQuota(args.session_id, args.amount);
        } else if (method_name === "broadcast_intent") {
          txResult = this.broadcastIntent(args.session_id, args.payload);
        } else if (method_name === "fill_intent") {
          txResult = this.fillIntent(args.intent_id, args.solver_id);
        } else {
          throw new Error(`Unknown transaction method: ${method_name}`);
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            status: { SuccessValue: Buffer.from(JSON.stringify(txResult)).toString("base64") },
            transaction: { hash: "tx_hash_mock_sandbox" },
          },
        };
      } catch (err: any) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            cause: { name: "ExecutionError" },
            message: err.message,
          },
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    };
  }

  // ─── HTTP Server Lifecycle ────────────────────────────────────────────────

  public async start(requestedPort: number = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method Not Allowed" }));
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const rawBody = Buffer.concat(chunks).toString("utf-8");
            const body = JSON.parse(rawBody);
            const rpcResponse = this.handleRpc(body);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(rpcResponse));
          } catch (err: any) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON body", detail: err.message }));
          }
        });
      });

      this.server.listen(requestedPort, "127.0.0.1", () => {
        this.port = (this.server!.address() as import("node:net").AddressInfo).port;
        resolve(this.port);
      });

      this.server.on("error", reject);
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  public getPort(): number {
    return this.port;
  }
}
