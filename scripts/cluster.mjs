/**
 * cluster.mjs — Local Multi-Node Cluster & Load Balancer Runner for Decant.
 *
 * Spawns the exact production architecture locally without requiring Docker:
 *   - Gateway Server 1 on port 8081 (NODE_ID=server-1)
 *   - Gateway Server 2 on port 8082 (NODE_ID=server-2)
 *   - Gateway Server 3 on port 8083 (NODE_ID=server-3)
 *   - Reverse Proxy Load Balancer on port 8080 with round-robin routing & SSE streaming support
 */

import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const NODES = [
  { id: "server-1", port: 8081 },
  { id: "server-2", port: 8082 },
  { id: "server-3", port: 8083 },
];

const LB_PORT = parseInt(process.env["PORT"] || "8080", 10);
const children = [];

console.log("==================================================================");
console.log(" 🚀 DECANT CLUSTER: Starting 3 Backend Nodes & Local Load Balancer");
console.log("==================================================================");

// Start Gateway Nodes
for (const node of NODES) {
  const env = {
    ...process.env,
    PORT: String(node.port),
    NODE_ID: node.id,
    LOAD_BALANCER_ACTIVE: "true",
  };

  const child = spawn("npx", ["tsx", "packages/gateway/src/proxy.ts"], {
    cwd: rootDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });

  child.stdout.on("data", (data) => {
    process.stdout.write(`[${node.id}] ${data.toString()}`);
  });

  child.stderr.on("data", (data) => {
    process.stderr.write(`[${node.id}:ERR] ${data.toString()}`);
  });

  children.push(child);
}

// Round-Robin Load Balancer
let currentIndex = 0;

const lbServer = http.createServer((req, res) => {
  const targetNode = NODES[currentIndex % NODES.length];
  currentIndex++;

  const options = {
    hostname: "127.0.0.1",
    port: targetNode.port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      "x-forwarded-host": req.headers.host || "localhost",
      "x-forwarded-node": targetNode.id,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, {
      ...proxyRes.headers,
      "x-load-balancer": "decant-local-lb",
      "x-routed-node": targetNode.id,
    });
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Bad Gateway: failed to route to ${targetNode.id}`, details: err.message }));
    }
  });

  req.pipe(proxyReq);
});

lbServer.listen(LB_PORT, "127.0.0.1", () => {
  console.log(`[decant-load-balancer] Routing active on http://127.0.0.1:${LB_PORT}`);
  console.log(`[decant-load-balancer] Upstream Cluster: ${NODES.map((n) => `${n.id} (:${n.port})`).join(", ")}`);
  console.log("------------------------------------------------------------------");
});

function cleanup() {
  console.log("\n[decant-cluster] Shutting down cluster nodes...");
  lbServer.close();
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
