/** Minimal OpenAI-compatible chat client (works with Gemini, OpenAI, Groq and OpenRouter). */

export interface LlmToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
  name?: string;
  [extra: string]: unknown;
}

export interface LlmTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const BASE_URLS: Record<string, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const DEFAULT_MODELS: Record<string, string> = {
  gemini: "gemini-3.8-flash",
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  openrouter: "openai/gpt-4o-mini",
};

export interface LlmConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function llmConfig(): LlmConfig | null {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) return null;
  const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  return {
    provider,
    apiKey,
    model: process.env.LLM_MODEL?.trim() || DEFAULT_MODELS[provider] || "gpt-4o-mini",
    baseUrl: (process.env.LLM_BASE_URL?.trim() || BASE_URLS[provider] || BASE_URLS.openai).replace(/\/$/, ""),
  };
}

export async function chatCompletion(cfg: LlmConfig, messages: LlmMessage[], tools: LlmTool[]): Promise<LlmMessage> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: 0.4,
  };
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    if (res.ok) {
      const json = (await res.json()) as { choices?: { message: LlmMessage }[] };
      const msg = json.choices?.[0]?.message;
      if (!msg) throw new Error("LLM returned no message");
      return msg;
    }
    lastError = `${res.status} ${(await res.text()).slice(0, 300)}`;
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error(`LLM request failed: ${lastError}`);
}
