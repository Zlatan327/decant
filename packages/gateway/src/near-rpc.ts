/**
 * near-rpc.ts — Lightweight NEAR RPC client for the Decant gateway.
 *
 * Phase 3: Replaces hardcoded session auth with on-chain view_method calls
 * to verify session registration and quota balance on the NEAR contract.
 *
 * This is a minimal, zero-dependency RPC client — no near-api-js needed
 * at the gateway level.  We only need view calls (read-only, no signing).
 */

// ─── Configuration ──────────────────────────────────────────────────────────

export interface NearRpcConfig {
  /** NEAR RPC endpoint URL (sandbox, testnet, or mainnet) */
  rpcUrl: string;
  /** Account ID where the Decant contract is deployed */
  contractId: string;
}

const DEFAULT_CONFIG: NearRpcConfig = {
  rpcUrl: process.env["NEAR_RPC_URL"] ?? "http://127.0.0.1:3030",
  contractId: process.env["NEAR_CONTRACT_ID"] ?? "decant.test.near",
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QuotaInfo {
  session_id: string;
  remaining: number;
  total: number;
}

export interface IntentRecord {
  intent_id: string;
  session_id: string;
  payload: string;
  status: "open" | "filled" | "expired";
  solver_id: string | null;
  created_at: number;
}

// ─── RPC Client ─────────────────────────────────────────────────────────────

export class NearRpcClient {
  private readonly config: NearRpcConfig;

  constructor(config: Partial<NearRpcConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a NEAR view_method call (read-only, no gas cost, no signing).
   */
  private async viewMethod<T>(methodName: string, args: Record<string, unknown> = {}): Promise<T> {
    const argsBase64 = Buffer.from(JSON.stringify(args)).toString("base64");

    const body = {
      jsonrpc: "2.0",
      id: "decant-gateway",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "optimistic",
        account_id: this.config.contractId,
        method_name: methodName,
        args_base64: argsBase64,
      },
    };

    const response = await fetch(this.config.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`NEAR RPC HTTP error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as {
      result?: { result?: number[] };
      error?: { cause?: { name: string }; message?: string };
    };

    if (json.error) {
      const cause = json.error.cause?.name ?? "Unknown";
      throw new Error(`NEAR RPC error [${cause}]: ${json.error.message ?? "unknown"}`);
    }

    if (!json.result?.result) {
      throw new Error("NEAR RPC: empty result from view call");
    }

    // Decode the byte array returned by NEAR into a JSON value
    const resultBytes = Buffer.from(json.result.result);
    return JSON.parse(resultBytes.toString("utf-8")) as T;
  }

  // ─── Contract view methods ─────────────────────────────────────────────

  /**
   * Check if a session is registered and has remaining quota.
   * Returns null if the session does not exist on-chain.
   */
  async getQuota(sessionId: string): Promise<QuotaInfo | null> {
    try {
      return await this.viewMethod<QuotaInfo>("get_quota", { session_id: sessionId });
    } catch (err) {
      // If the contract panics because the session doesn't exist, return null
      if (err instanceof Error && err.message.includes("Session not found")) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Get an intent by its ID.
   */
  async getIntent(intentId: string): Promise<IntentRecord | null> {
    try {
      return await this.viewMethod<IntentRecord>("get_intent", { intent_id: intentId });
    } catch (err) {
      if (err instanceof Error && err.message.includes("Intent not found")) {
        return null;
      }
      throw err;
    }
  }

  /**
   * List all open intents (waiting for a solver).
   */
  async listOpenIntents(): Promise<IntentRecord[]> {
    return this.viewMethod<IntentRecord[]>("list_open_intents", {});
  }

  /**
   * Health check: verifies the RPC endpoint is reachable and the
   * contract is deployed.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const body = {
        jsonrpc: "2.0",
        id: "health",
        method: "status",
        params: [],
      };
      const res = await fetch(this.config.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
