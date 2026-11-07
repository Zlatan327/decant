/**
 * cluster-redis.ts — Unit and Integration Tests for Decant's Clustered Architecture.
 *
 * Validates:
 *   1. Node ID identification (X-Decant-Node-Id headers & /health response)
 *   2. DecantRedisClient RESP parser & commands
 *   3. Distributed rate limiter integration across cluster nodes
 *   4. Connection Pooler diagnostics
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { DecantGatewayServer } from "../src/server.js";
import { DecantRedisClient } from "../src/redis.js";
import { DecantConnectionPooler } from "../src/pooler.js";

describe("Clustered Architecture & Distributed Telemetry", () => {
  test("Gateway identifies its node ID in response headers and /health", async () => {
    const server = new DecantGatewayServer({
      port: 0,
      nodeId: "server-2",
      adminKey: "test-admin-key",
    });
    const port = await server.start("127.0.0.1");

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { connection: "close" },
      });
      assert.equal(res.status, 200);

      // Verify node ID header
      const nodeIdHeader = res.headers.get("x-decant-node-id");
      assert.equal(nodeIdHeader, "server-2");

      const body = await res.json() as any;
      assert.equal(body.nodeId, "server-2");
      assert.equal(body.cluster.nodeId, "server-2");
      assert.ok(body.cluster.redis !== undefined);
      assert.ok(body.cluster.pooler !== undefined);
    } finally {
      await server.stop();
    }
  });

  test("Connection Pooler reports pgbouncer and postgres parameters when configured", () => {
    const pooler = new DecantConnectionPooler("postgres://user:pass@pooler.internal:6432/decant");
    const health = pooler.getHealth();
    assert.equal(health.configured, true);
    assert.equal(health.type, "pgbouncer");
    assert.equal(health.port, 6432);
    assert.equal(health.database, "decant");
    assert.equal(pooler.isPoolerActive(), true);

    const localPooler = new DecantConnectionPooler(":memory:");
    assert.equal(localPooler.isPoolerActive(), false);
    assert.equal(localPooler.getHealth().type, "sqlite-embedded");
  });

  test("Redis RESP protocol parser correctly processes simple strings, integers, bulk strings and arrays", async () => {
    const sockets = new Set<net.Socket>();
    const mockServer = net.createServer((socket) => {
      socket.unref();
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      let buf = "";
      socket.on("data", (chunk) => {
        buf += chunk.toString("utf-8");
        while (buf.includes("\r\n")) {
          if (buf.startsWith("*")) {
            const crlf = buf.indexOf("\r\n");
            const numArgs = parseInt(buf.slice(1, crlf), 10);
            let idx = crlf + 2;
            const args: string[] = [];
            let complete = true;
            for (let i = 0; i < numArgs; i++) {
              const argLenCrlf = buf.indexOf("\r\n", idx);
              if (argLenCrlf === -1) { complete = false; break; }
              const len = parseInt(buf.slice(idx + 1, argLenCrlf), 10);
              const argStart = argLenCrlf + 2;
              const argEnd = argStart + len;
              if (buf.length < argEnd + 2) { complete = false; break; }
              args.push(buf.slice(argStart, argEnd));
              idx = argEnd + 2;
            }
            if (!complete) break;
            buf = buf.slice(idx);

            const cmd = (args[0] || "").toUpperCase();
            if (cmd === "PING") {
              socket.write("+PONG\r\n");
            } else if (cmd === "INCR") {
              socket.write(":1\r\n");
            } else if (cmd === "EXPIRE") {
              socket.write(":1\r\n");
            } else if (cmd === "SET") {
              socket.write("+OK\r\n");
            } else if (cmd === "GET") {
              socket.write("$-1\r\n");
            } else {
              socket.write("+OK\r\n");
            }
          } else {
            buf = "";
            break;
          }
        }
      });
    });

    await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", () => resolve()));
    mockServer.unref();
    const address = mockServer.address() as net.AddressInfo;

    const redis = new DecantRedisClient(`redis://127.0.0.1:${address.port}`);
    assert.equal(redis.isConfigured(), true);

    const connected = await redis.connect();
    assert.equal(connected, true);
    assert.equal(redis.isConnected(), true);

    // Test PING
    const pingOk = await redis.ping();
    assert.equal(pingOk, true);

    // Test distributed rate limit check
    const rateCheck = await redis.checkRateLimit("test-session-01", 3, 10_000);
    assert.equal(rateCheck.allowed, true);
    assert.equal(rateCheck.remaining, 2);

    // Test signature replay claim
    const claimFresh = await redis.claimSignature("sig_abc123", 60);
    assert.equal(claimFresh, true);

    redis.disconnect();
    for (const s of sockets) s.destroy();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });
});
