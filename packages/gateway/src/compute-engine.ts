import { GoogleGenAI } from "@google/genai";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface CompletionOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
}
export interface StreamEvent {
  token?: string;
  isComplete: boolean;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  model: string;
}

/** Real provider transport. Credit units are ceil(characters / 4), not provider token usage. */
export class DecantComputeEngine {
  public readonly defaultModel: string;
  private readonly geminiClient: GoogleGenAI | null;
  private readonly upstreamBaseUrl: string | undefined;
  private readonly upstreamApiKey: string | undefined;
  private readonly geminiModel: string | undefined;

  constructor() {
    this.geminiClient = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
    this.geminiModel = process.env.GEMINI_MODEL?.trim() || undefined;
    this.upstreamBaseUrl = (process.env.UPSTREAM_BASE_URL || process.env.DEPIN_BASE_URL)?.trim().replace(/\/$/, "") || undefined;
    this.upstreamApiKey = (process.env.UPSTREAM_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.HYPERBOLIC_API_KEY)?.trim() || undefined;
    this.defaultModel = (process.env.DECANT_MODEL || process.env.UPSTREAM_MODEL || this.geminiModel || "").trim();
  }

  public estimateTokens(text: string): number { return Math.ceil(text.length / 4); }
  public promptUnits(messages: ChatMessage[]): number {
    return this.estimateTokens(messages.map(m => `${m.role}: ${m.content}`).join("\n"));
  }
  public get models(): string[] {
    const list = new Set<string>();
    if (this.defaultModel) list.add(this.defaultModel);
    if (this.geminiModel) list.add(this.geminiModel);
    if (this.geminiClient) {
      list.add("gemini-3.5-flash");
      list.add("gemini-3.5-flash-lite");
      list.add("gemini-3.8-flash");
    }
    const extra = (process.env.DECANT_MODELS || process.env.SUPPORTED_MODELS || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    for (const m of extra) list.add(m);
    return [...list];
  }
  public get configured(): boolean {
    return Boolean(this.defaultModel && ((this.geminiClient && this.geminiModel) || this.upstreamBaseUrl));
  }

  public async *streamChat(opts: CompletionOptions): AsyncGenerator<StreamEvent> {
    const started = Date.now();
    const model = opts.model || this.defaultModel;
    const promptTokens = this.promptUnits(opts.messages);
    const limit = opts.maxTokens ?? 1024;
    let output = "";
    const event = (token?: string, isComplete = false): StreamEvent => ({
      token, isComplete, promptTokens,
      completionTokens: this.estimateTokens(output),
      totalTokens: promptTokens + this.estimateTokens(output),
      latencyMs: Date.now() - started, model,
    });
    const append = (text: string) => {
      if (this.estimateTokens(output + text) > limit) throw new Error("Provider output exceeded the authorized credit limit");
      output += text;
    };

    if (!model) throw new Error("Configure an inference model before requesting compute");
    const isGeminiModel = Boolean(
      this.geminiClient && (
        model === this.geminiModel ||
        model.startsWith("gemini-")
      )
    );

    if (isGeminiModel && this.geminiClient) {
      const systemInstruction = opts.messages.filter(m => m.role === "system").map(m => m.content).join("\n");
      const response = await this.geminiClient.models.generateContentStream({
        model,
        contents: opts.messages.filter(m => m.role !== "system").map(m => ({
          role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }],
        })),
        config: { systemInstruction: systemInstruction || undefined, maxOutputTokens: limit,
          temperature: opts.temperature, abortSignal: opts.signal },
      });
      let finished = false;
      for await (const chunk of response) {
        const reason = chunk.candidates?.[0]?.finishReason;
        if (reason && reason !== "STOP" && reason !== "MAX_TOKENS") throw new Error(`Provider stopped generation: ${reason}`);
        if (reason) finished = true;
        if (chunk.text) { append(chunk.text); yield event(chunk.text); }
      }
      if (!finished) throw new Error("Provider stream ended without completion confirmation");
    } else {
      if (!this.upstreamBaseUrl) throw new Error("No compatible inference provider is configured for this model");
      const response = await fetch(`${this.upstreamBaseUrl}/chat/completions`, {
        method: "POST", signal: opts.signal,
        headers: { "Content-Type": "application/json", Accept: "text/event-stream",
          ...(this.upstreamApiKey ? { Authorization: `Bearer ${this.upstreamApiKey}` } : {}) },
        body: JSON.stringify({ model, messages: opts.messages, stream: true,
          max_tokens: limit, temperature: opts.temperature ?? 0.7 }),
      });
      if (!response.ok) throw new Error(`Inference provider returned HTTP ${response.status}`);
      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
        throw new Error("Inference provider did not return an SSE stream");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      let doneMarker = false;
      try {
        while (!doneMarker) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          if (buffer.length > 1024 * 1024) throw new Error("Provider SSE frame is too large");
          if (done) buffer += "\n";
          let end: number;
          while ((end = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, end).trim();
            buffer = buffer.slice(end + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") { doneMarker = true; break; }
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error("Inference provider reported a stream error");
            if (parsed.choices?.some((c: any) => c.finish_reason != null)) finished = true;
            const text = parsed.choices?.[0]?.delta?.content;
            if (typeof text === "string" && text) { append(text); yield event(text); }
          }
          if (done) break;
        }
        if (!finished && !doneMarker) throw new Error("Provider stream ended without completion confirmation");
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    if (!output) throw new Error("Inference provider returned no text");
    yield event(undefined, true);
  }
}
