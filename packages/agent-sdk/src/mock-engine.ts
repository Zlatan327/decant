/**
 * mock-engine.ts — Deterministic local LLM response simulator.
 *
 * Phase 1 ONLY.  Returns canned responses keyed by prompt substring.
 * This is explicitly NOT used in production — it exists to let integration
 * tests run without hitting a real inference endpoint.
 */

export interface MockResponse {
  model: string;
  text: string;
  tokens_used: number;
}

const CANNED: Record<string, MockResponse> = {
  hello: {
    model: "mock-llama-3",
    text: "Hello! I'm a deterministic mock. No hallucinations here.",
    tokens_used: 12,
  },
  summarize: {
    model: "mock-llama-3",
    text: "TL;DR: The document covers decentralized intent routing for AI agents.",
    tokens_used: 18,
  },
};

const DEFAULT_RESPONSE: MockResponse = {
  model: "mock-llama-3",
  text: "Mock response: I don't have a canned answer for that prompt.",
  tokens_used: 15,
};

/**
 * Return a deterministic response for the given prompt.
 * Matching is case-insensitive substring search.
 */
export function mockInfer(prompt: string): MockResponse {
  const lower = prompt.toLowerCase();
  for (const [key, response] of Object.entries(CANNED)) {
    if (lower.includes(key)) {
      return { ...response };
    }
  }
  return { ...DEFAULT_RESPONSE };
}
