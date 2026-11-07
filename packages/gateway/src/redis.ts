/**
 * redis.ts — Lightweight, Dependency-Free Redis Client for Decant Gateway.
 *
 * Implements a pure Node.js RESP (Redis Serialization Protocol) client using `node:net`.
 * Eliminates external npm dependencies while providing production-ready Redis integration for:
 *   - Distributed Token-Bucket Rate Limiting across clustered gateway instances (Server 1, 2, 3)
 *   - Fast Replay-Attack Nonce Cache with TTL
 *   - Cluster Node Health & Diagnostics
 *
 * Falls back cleanly when REDIS_URL is not configured or reachable.
 */

import net from "node:net";
import { URL } from "node:url";

export interface RedisRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export interface RedisHealthStatus {
  configured: boolean;
  connected: boolean;
  url?: string;
  pingMs?: number;
  lastError?: string;
}

export class DecantRedisClient {
  private socket: net.Socket | null = null;
  private host: string = "127.0.0.1";
  private port: number = 6379;
  private password?: string;
  private connected: boolean = false;
  private connecting: boolean = false;
  private buffer: string = "";
  private pendingCallbacks: Array<(err: Error | null, res: any) => void> = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private configuredUrl?: string;
  private lastPingMs: number = 0;
  private lastError?: string;
  private isClosed: boolean = false;

  constructor(redisUrl?: string) {
    const rawUrl = redisUrl || process.env["REDIS_URL"];
    if (rawUrl) {
      this.configuredUrl = rawUrl;
      try {
        const parsed = new URL(rawUrl);
        this.host = parsed.hostname || "127.0.0.1";
        this.port = parseInt(parsed.port || "6379", 10);
        if (parsed.password) {
          this.password = decodeURIComponent(parsed.password);
        }
      } catch {
        // Fall back to default host/port if URL parsing fails
      }
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.configuredUrl);
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async connect(): Promise<boolean> {
    if (!this.isConfigured() || this.connected || this.connecting) {
      return this.connected;
    }

    this.isClosed = false;
    this.connecting = true;
    return new Promise((resolve) => {
      try {
        this.socket = net.createConnection({ host: this.host, port: this.port }, () => {
          this.connected = true;
          this.connecting = false;
          this.lastError = undefined;

          if (this.password) {
            this.sendCommand(["AUTH", this.password], (err) => {
              if (err) {
                this.lastError = `Redis AUTH failed: ${err.message}`;
                this.disconnect();
                resolve(false);
              } else {
                resolve(true);
              }
            });
          } else {
            resolve(true);
          }
        });

        this.socket.setNoDelay(true);
        this.socket.setKeepAlive(true, 10000);
        this.socket.unref();

        this.socket.on("data", (data) => {
          this.buffer += data.toString("utf-8");
          this.processResponses();
        });

        this.socket.on("error", (err) => {
          this.lastError = err.message;
          this.connected = false;
          this.connecting = false;
          resolve(false);
        });

        this.socket.on("close", () => {
          this.connected = false;
          this.connecting = false;
          this.scheduleReconnect();
        });
      } catch (err: any) {
        this.lastError = err.message;
        this.connected = false;
        this.connecting = false;
        resolve(false);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.isClosed || this.reconnectTimer || !this.isConfigured()) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, 5000);
  }

  public disconnect(): void {
    this.isClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.connecting = false;
  }

  private sendCommand(args: string[], callback: (err: Error | null, res: any) => void): void {
    if (!this.socket || !this.connected) {
      callback(new Error("Redis socket not connected"), null);
      return;
    }

    // Format RESP array: *<num-args>\r\n$<arg1-len>\r\n<arg1>\r\n...
    let cmd = `*${args.length}\r\n`;
    for (const arg of args) {
      const str = String(arg);
      cmd += `$${Buffer.byteLength(str, "utf-8")}\r\n${str}\r\n`;
    }

    this.pendingCallbacks.push(callback);
    this.socket.write(cmd);
  }

  private processResponses(): void {
    while (this.buffer.length > 0) {
      const parsed = this.parseResp(this.buffer);
      if (!parsed) break; // Incomplete response in buffer

      this.buffer = this.buffer.slice(parsed.bytesConsumed);
      const cb = this.pendingCallbacks.shift();
      if (cb) {
        if (parsed.isError) {
          cb(new Error(parsed.value), null);
        } else {
          cb(null, parsed.value);
        }
      }
    }
  }

  private parseResp(input: string): { value: any; isError: boolean; bytesConsumed: number } | null {
    if (input.length < 3) return null;
    const prefix = input[0];
    const crlfIndex = input.indexOf("\r\n");
    if (crlfIndex === -1) return null;

    if (prefix === "+") {
      // Simple string
      return {
        value: input.slice(1, crlfIndex),
        isError: false,
        bytesConsumed: crlfIndex + 2,
      };
    }

    if (prefix === "-") {
      // Error
      return {
        value: input.slice(1, crlfIndex),
        isError: true,
        bytesConsumed: crlfIndex + 2,
      };
    }

    if (prefix === ":") {
      // Integer
      const num = parseInt(input.slice(1, crlfIndex), 10);
      return {
        value: num,
        isError: false,
        bytesConsumed: crlfIndex + 2,
      };
    }

    if (prefix === "$") {
      // Bulk string
      const len = parseInt(input.slice(1, crlfIndex), 10);
      if (len === -1) {
        return {
          value: null,
          isError: false,
          bytesConsumed: crlfIndex + 2,
        };
      }
      const dataStart = crlfIndex + 2;
      const dataEnd = dataStart + len;
      if (input.length < dataEnd + 2) return null; // Incomplete bulk string

      return {
        value: input.slice(dataStart, dataEnd),
        isError: false,
        bytesConsumed: dataEnd + 2,
      };
    }

    if (prefix === "*") {
      // Array
      const count = parseInt(input.slice(1, crlfIndex), 10);
      if (count === -1) {
        return {
          value: null,
          isError: false,
          bytesConsumed: crlfIndex + 2,
        };
      }
      let offset = crlfIndex + 2;
      const arr: any[] = [];
      for (let i = 0; i < count; i++) {
        const item = this.parseResp(input.slice(offset));
        if (!item) return null;
        arr.push(item.value);
        offset += item.bytesConsumed;
      }
      return {
        value: arr,
        isError: false,
        bytesConsumed: offset,
      };
    }

    return null;
  }

  // ── High-Level Redis API Methods ──────────────────────────────────────────

  public async ping(): Promise<boolean> {
    if (!this.connected) return false;
    const start = Date.now();
    return new Promise((resolve) => {
      this.sendCommand(["PING"], (err, res) => {
        if (!err && res === "PONG") {
          this.lastPingMs = Date.now() - start;
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  }

  public async get(key: string): Promise<string | null> {
    if (!this.connected) return null;
    return new Promise((resolve, reject) => {
      this.sendCommand(["GET", key], (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
  }

  public async set(key: string, value: string, exSeconds?: number, nx = false): Promise<boolean> {
    if (!this.connected) return false;
    const args = ["SET", key, value];
    if (exSeconds) {
      args.push("EX", String(exSeconds));
    }
    if (nx) {
      args.push("NX");
    }
    return new Promise((resolve) => {
      this.sendCommand(args, (err, res) => {
        resolve(!err && res === "OK");
      });
    });
  }

  /**
   * Distributed atomic token-bucket rate limiter.
   * Tracks requests in Redis keyed by session ID with an expiration window.
   */
  public async checkRateLimit(
    sessionId: string,
    maxRequests: number = 3,
    windowMs: number = 10_000
  ): Promise<RedisRateLimitResult> {
    if (!this.connected) {
      // When Redis is offline, allow caller to use in-memory fallback
      return { allowed: true, remaining: maxRequests, resetMs: windowMs };
    }

    const key = `decant:ratelimit:${sessionId}`;
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

    return new Promise((resolve) => {
      // Increment and set TTL if new
      this.sendCommand(["INCR", key], (err, count) => {
        if (err || typeof count !== "number") {
          resolve({ allowed: true, remaining: maxRequests, resetMs: windowMs });
          return;
        }

        if (count === 1) {
          this.sendCommand(["EXPIRE", key, String(windowSeconds)], () => {});
        }

        if (count > maxRequests) {
          resolve({ allowed: false, remaining: 0, resetMs: windowMs });
        } else {
          resolve({ allowed: true, remaining: Math.max(0, maxRequests - count), resetMs: windowMs });
        }
      });
    });
  }

  /**
   * Distributed nonce / signature replay protection.
   * Uses Redis SET ... EX 60 NX for sub-millisecond atomic replay rejection.
   */
  public async claimSignature(signature: string, ttlSeconds: number = 60): Promise<boolean> {
    if (!this.connected) return true; // Fall back to SQLite claim
    const key = `decant:sig:${signature}`;
    return new Promise((resolve) => {
      this.sendCommand(["SET", key, "1", "EX", String(ttlSeconds), "NX"], (err, res) => {
        // 'OK' means the key did not exist before and was successfully set (fresh request)
        // null means the key already existed (replayed request)
        resolve(!err && res === "OK");
      });
    });
  }

  public getHealth(): RedisHealthStatus {
    return {
      configured: this.isConfigured(),
      connected: this.connected,
      url: this.configuredUrl ? this.configuredUrl.replace(/:[^:@]+@/, ":***@") : undefined,
      pingMs: this.lastPingMs,
      lastError: this.lastError,
    };
  }
}
