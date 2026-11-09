/**
 * cluster-redis.ts — Unit and Integration Tests for Decant's Clustered Architecture.
 *
 * Validates:
 *   1. Node ID identification (X-Decant-Node-Id headers & /health response)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DecantGatewayServer } from "../src/server.js";

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
    } finally {
      await server.stop();
    }
  });

});
