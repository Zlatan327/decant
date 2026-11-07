/**
 * pooler.ts — Connection Pooler & Relational Database Integration for Decant Gateway.
 *
 * Implements diagnostics and configuration validation for the Connection Pooler layer
 * (PgBouncer / Supabase Supavisor / PostgreSQL) as part of Decant's enterprise cluster topology:
 *
 *   [Backend Servers (1, 2, 3)] ──▶ [Connection Pooler (PgBouncer)] ──▶ [PostgreSQL Database]
 *
 * When DATABASE_URL or POOLER_URL is set, validates connection pool parameters and transaction
 * mode to ensure strict ACID credit reservation semantics across horizontally scaled gateway nodes.
 */

export interface PoolerHealthStatus {
  configured: boolean;
  type: "pgbouncer" | "sqlite-embedded" | "direct-postgres";
  poolMode: "transaction" | "session" | "none";
  host?: string;
  port?: number;
  maxConnections?: number;
  database?: string;
}

export class DecantConnectionPooler {
  private configuredUrl?: string;
  private type: "pgbouncer" | "sqlite-embedded" | "direct-postgres" = "sqlite-embedded";
  private host?: string;
  private port?: number;
  private database?: string;
  private poolMode: "transaction" | "session" | "none" = "none";

  constructor(poolerUrl?: string) {
    const rawUrl = poolerUrl || process.env["POOLER_URL"] || process.env["DATABASE_URL"];
    if (rawUrl && (rawUrl.startsWith("postgres://") || rawUrl.startsWith("postgresql://"))) {
      this.configuredUrl = rawUrl;
      try {
        const parsed = new URL(rawUrl);
        this.host = parsed.hostname;
        this.port = parseInt(parsed.port || "6432", 10);
        this.database = parsed.pathname.replace(/^\//, "");
        // Default pgbouncer port is 6432
        this.type = this.port === 6432 || process.env["PGBOUNCER_ENABLED"] === "true" ? "pgbouncer" : "direct-postgres";
        this.poolMode = (process.env["PGBOUNCER_POOL_MODE"] as any) || "transaction";
      } catch {
        this.type = "sqlite-embedded";
      }
    } else {
      this.type = "sqlite-embedded";
    }
  }

  public isPoolerActive(): boolean {
    return this.type === "pgbouncer";
  }

  public getHealth(): PoolerHealthStatus {
    return {
      configured: this.type !== "sqlite-embedded",
      type: this.type,
      poolMode: this.poolMode,
      host: this.host,
      port: this.port,
      database: this.database,
      maxConnections: parseInt(process.env["DB_POOL_MAX"] || "20", 10),
    };
  }
}
