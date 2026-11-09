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

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);


async function callOnce(cfg: LlmConfig, model: string, messages: LlmMessage[], tools: LlmTool[], timeoutMs: number, effort: string | null) {
  const body: Record<string, unknown> = { model, messages, temperature: 0.4 };
  if (tools.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  // Short thinking keeps voice-style replies fast (Gemini and OpenAI reasoning models accept this)
  if (effort) body.reasoning_effort = effort;
  return fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Calls the model, retrying busy/overloaded responses (429/503…) with growing waits.
 * If LLM_FALLBACK_MODEL is set, it is tried after the main model keeps failing.
 */
export async function chatCompletion(cfg: LlmConfig, messages: LlmMessage[], tools: LlmTool[]): Promise<LlmMessage> {
  const models = [cfg.model, process.env.LLM_FALLBACK_MODEL?.trim()].filter((m): m is string => !!m);
  const deadline = Date.now() + 40000; // keep the caller waiting at most ~40s in total
  // LLM_REASONING_EFFORT: low | medium | high, or "off" to never send it. Default: low for Gemini.
  const effortSetting = process.env.LLM_REASONING_EFFORT?.trim().toLowerCase();
  let effort: string | null = effortSetting === "off" ? null : effortSetting || (cfg.provider === "gemini" ? "low" : null);
  let lastError = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 3000) break;
      let res: Response;
      try {
        res = await callOnce(cfg, model, messages, tools, Math.min(25000, remaining), effort);
      } catch (e) {
        lastError = e instanceof Error && e.name === "TimeoutError" ? "timeout: the model took too long to answer" : e instanceof Error ? e.message : String(e);
        continue;
      }
      if (res.ok) {
        const json = (await res.json()) as { choices?: { message: LlmMessage }[] };
        const msg = json.choices?.[0]?.message;
        if (!msg) throw new Error("LLM returned no message");
        return msg;
      }
      lastError = `${res.status} ${(await res.text()).slice(0, 300)}`;
      if (res.status === 400 && effort && /reasoning/i.test(lastError)) {
        effort = null; // this model doesn't accept reasoning_effort: retry straight away without it
        continue;
      }
      if (!RETRYABLE.has(res.status)) break; // wrong key or model name: retrying won't help
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 4000) : 700 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, Math.max(0, deadline - Date.now() - 3000))));
    }
    if (deadline - Date.now() < 3000) break;
  }
  throw new Error(`LLM request failed: ${lastError}`);
}
