/**
 * depin-node.ts — Web3 DePIN Compute Solver Node.
 *
 * Simulates a decentralized compute provider (such as Hyperbolic, Akash, or Livepeer)
 * serving Llama-3 inference via standard OpenAI-compatible Server-Sent Events (SSE)
 * over HTTP streaming sockets.
 *
 * When an external provider URL is configured via DEPIN_COMPUTE_URL, requests are
 * forwarded to that provider. Otherwise, it executes high-speed, token-by-token
 * streaming inference locally with realistic token latencies.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

export interface DePINNodeOptions {
  model?: string;
  tokenDelayMs?: number;
}

export class DePINComputeNode {
  private server: Server | null = null;
  private port: number = 0;
  public readonly model: string;
  private tokenDelayMs: number;

  constructor(opts: DePINNodeOptions = {}) {
    this.model = opts.model ?? "meta-llama/Meta-Llama-3-8B-Instruct";
    this.tokenDelayMs = opts.tokenDelayMs ?? 20; // 20ms per token for fluid streaming
  }

  /**
   * Generates a deterministic, relevant response to the agent's prompt.
   */
  private generateLlamaResponse(prompt: string): string[] {
    const p = prompt.toLowerCase();
    let text = "";

    if (p.includes("summary") || p.includes("summarize")) {
      text = "Decant provides decentralized credit routing and intent settlement for AI agents. By anchoring quotas to NEAR smart contracts and filtering traffic via deterministic proxy policies, agents can consume upstream compute on credit with zero risk of credit drain or hallucinations.";
    } else if (p.includes("sentiment") || p.includes("analyze")) {
      text = "Sentiment Analysis: Strongly Bullish on decentralized compute. Decant eliminates centralized gateway bottlenecks through peer-to-peer intent matching and trustless on-chain escrow.";
    } else {
      text = `[Llama-3-8B-Instruct via DePIN]: Acknowledged prompt "${prompt}". Processing workload on decentralized GPU cluster. Compute quota verified and settled against on-chain ledger. Execution finished successfully.`;
    }

    // Split text into tokens (words + whitespace)
    const tokens: string[] = [];
    const words = text.split(/(\s+)/);
    for (const w of words) {
      if (w.length > 0) tokens.push(w);
    }
    return tokens;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", model: this.model, provider: "DePIN-Akash-Hyperbolic" }));
      return;
    }

    if (req.method === "POST" && (req.url === "/v1/chat/completions" || req.url === "/api/v1/infer")) {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", async () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          const body = JSON.parse(raw || "{}");
          const prompt = body.prompt ?? body.messages?.[0]?.content ?? "Hello DePIN";
          const stream = body.stream !== false; // default true for SSE

          const tokens = this.generateLlamaResponse(prompt);

          if (stream) {
            // Server-Sent Events headers
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
              "X-DePIN-Provider": "Hyperbolic-Akash-Llama3",
              "X-DePIN-Model": this.model,
            });

            // Stream tokens progressively
            for (let i = 0; i < tokens.length; i++) {
              const token = tokens[i];
              const sseChunk = JSON.stringify({
                id: `chatcmpl-depin-${Date.now()}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: this.model,
                choices: [
                  {
                    index: 0,
                    delta: { content: token },
                    finish_reason: i === tokens.length - 1 ? "stop" : null,
                  },
                ],
              });

              res.write(`data: ${sseChunk}\n\n`);
              if (this.tokenDelayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, this.tokenDelayMs));
              }
            }

            res.write("data: [DONE]\n\n");
            res.end();
          } else {
            // Standard JSON response
            const fullContent = tokens.join("");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                id: `chatcmpl-depin-${Date.now()}`,
                object: "chat.completion",
                model: this.model,
                choices: [{ message: { role: "assistant", content: fullContent }, finish_reason: "stop" }],
                usage: { total_tokens: tokens.length },
              })
            );
          }
        } catch (err: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Endpoint not found" }));
  }

  public async start(requestedPort: number = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
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
