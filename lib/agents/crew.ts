import type { AgentId, TraceEvent } from "../types";
import { TOOL_DEFS, executeTool, type ToolContext } from "../tools";
import { getStore } from "../store";
import { AGENTS } from "./definitions";
import { chatCompletion, llmConfig, type LlmMessage, type LlmTool } from "./llm";
import { createSession, getSession, syncCallRecord, type CrewSession } from "./session";
import { demoGreeting, demoTurn } from "./demo-engine";

export interface CrewReply {
  sessionId: string;
  reply: string;
  agent: AgentId;
  events: TraceEvent[];
  mode: "llm" | "demo";
  notice?: string;
  ended?: boolean;
}

const MAX_STEPS = 10;
const now = () => new Date().toISOString();

function handoffTool(from: AgentId): LlmTool {
  const targets = AGENTS[from].handoffs;
  return {
    type: "function",
    function: {
      name: "handoff",
      description: `Hand the caller to a teammate. ${targets.map((t) => `${t}: ${AGENTS[t].role}.`).join(" ")}`,
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", enum: targets },
          reason: { type: "string", description: "Short note for the teammate with details gathered so far" },
        },
        required: ["to", "reason"],
      },
    },
  };
}

function toolsFor(agent: AgentId): LlmTool[] {
  const tools: LlmTool[] = AGENTS[agent].tools.map((name) => ({
    type: "function",
    function: { name, description: TOOL_DEFS[name].description, parameters: TOOL_DEFS[name].parameters },
  }));
  tools.push(handoffTool(agent));
  return tools;
}

function trimJson(value: unknown, max = 900) {
  const s = JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Starts a conversation and returns the receptionist's greeting. */
export async function startConversation(input: { sessionId: string; callerPhone: string; channel?: CrewSession["channel"] }) {
  const session = createSession(input.sessionId, input.channel ?? "web_chat", input.callerPhone);
  const ctx: ToolContext = { callerPhone: session.callerPhone, channel: session.channel, sessionId: session.id, effects: session.effects };
  const events: TraceEvent[] = [];
  let firstName: string | undefined;
  if (session.callerPhone) {
    events.push({ type: "tool_call", agent: "receptionist", tool: "lookup_caller", args: { phone: session.callerPhone }, at: now() });
    const res = await executeTool("lookup_caller", {}, ctx);
    events.push({ type: "tool_result", agent: "receptionist", tool: "lookup_caller", ok: res.ok, summary: res.summary, at: now() });
    if (res.data.returning) {
      session.callerName = String(res.data.name);
      firstName = session.callerName.split(" ")[0];
      const last = res.data.last_order as { items: { name: string; quantity: number }[] } | null;
      session.facts.push(`Returning customer ${session.callerName}, ${res.data.total_orders} past orders. Last order: ${last ? last.items.map((i) => `${i.quantity}x ${i.name}`).join(", ") : "none"}.`);
    }
  }
  const settings = await getStore().getSettings();
  const greeting = demoGreeting(settings.restaurantName, firstName);
  session.history.push({ role: "assistant", content: greeting, agent: "receptionist" });
  session.transcript.push({ role: "agent", agent: "receptionist", text: greeting, at: now() });
  session.trace.push(...events);
  session.updatedAt = now();
  await syncCallRecord(session);
  return { sessionId: session.id, reply: greeting, agent: "receptionist" as AgentId, events, mode: llmConfig() ? "llm" : "demo" } satisfies CrewReply;
}

/** Runs one caller turn through the multi-agent crew. */
export async function runCrewTurn(input: { sessionId: string; message: string; callerPhone?: string }): Promise<CrewReply> {
  let session = getSession(input.sessionId);
  if (!session) {
    await startConversation({ sessionId: input.sessionId, callerPhone: input.callerPhone ?? "" });
    session = getSession(input.sessionId)!;
  }
  const text = input.message.trim().slice(0, 2000);
  session.history.push({ role: "user", content: text });
  session.transcript.push({ role: "caller", text, at: now() });

  const cfg = llmConfig();
  let result: { reply: string; events: TraceEvent[] };
  let mode: CrewReply["mode"] = "demo";
  let notice: string | undefined;

  if (cfg) {
    try {
      result = await llmTurn(session, cfg);
      mode = "llm";
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[crew] LLM error:", detail);
      notice = `The AI provider returned an error, so the built-in crew answered. Check LLM_MODEL and LLM_API_KEY in .env.local. (${detail.slice(0, 160)}${detail.length > 160 ? "…" : ""})`;
      result = await demoTurn(session, text);
    }
  } else {
    result = await demoTurn(session, text);
  }

  session.history.push({ role: "assistant", content: result.reply, agent: session.activeAgent });
  session.transcript.push({ role: "agent", agent: session.activeAgent, text: result.reply, at: now() });
  session.trace.push(...result.events);
  session.updatedAt = now();
  await syncCallRecord(session);

  return { sessionId: session.id, reply: result.reply, agent: session.activeAgent, events: result.events, mode, notice };
}

async function llmTurn(session: CrewSession, cfg: NonNullable<ReturnType<typeof llmConfig>>) {
  const events: TraceEvent[] = [];
  const settings = await getStore().getSettings();
  const ctx: ToolContext = { callerPhone: session.callerPhone, channel: session.channel, sessionId: session.id, effects: session.effects };

  // Conversation as plain text turns (works across providers even after handoffs)
  // Some providers require the first turn after the system prompt to be the caller's,
  // so the opening greeting is passed as a fact instead of an assistant turn.
  const firstUser = session.history.findIndex((h) => h.role === "user");
  const greeting = session.history.slice(0, Math.max(0, firstUser)).map((h) => h.content).join(" ");
  const conversation: LlmMessage[] = session.history.slice(Math.max(0, firstUser)).map((h) => ({ role: h.role, content: h.content }));
  if (greeting && !session.facts.some((f) => f.startsWith("Opening greeting"))) session.facts.unshift(`Opening greeting already said to the caller: "${greeting}"`);
  let working: LlmMessage[] = [];
  let agent = session.activeAgent;
  let handoffs = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const def = AGENTS[agent];
    const facts = session.facts.length ? `\n\nFacts gathered earlier in this call (from tools and teammates):\n- ${session.facts.slice(-14).join("\n- ")}` : "";
    const system: LlmMessage = {
      role: "system",
      content: def.prompt({ settings, callerPhone: session.callerPhone || undefined, callerName: session.callerName, channel: session.channel }) + facts,
    };
    const msg = await chatCompletion(cfg, [system, ...conversation, ...working], toolsFor(agent));
    const calls = msg.tool_calls ?? [];

    if (!calls.length) {
      const reply = (msg.content ?? "").trim() || "Sorry, could you say that again?";
      session.activeAgent = agent;
      return { reply, events };
    }

    working.push({ ...msg, role: "assistant", content: msg.content ?? "" });
    let switched = false;
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      const name = call.function.name;

      if (name === "handoff") {
        const to = String(args.to) as AgentId;
        const reason = String(args.reason ?? "");
        if (!AGENTS[to] || to === agent || handoffs >= 3) {
          working.push(toolMessage(cfg.provider, call.id, name, { ok: false, error: "Handoff not allowed; continue helping the caller yourself." }));
          continue;
        }
        events.push({ type: "handoff", from: agent, to, reason, at: now() });
        session.facts.push(`${AGENTS[agent].name} handed off to ${to}: ${reason}`);
        if (!session.agentsUsed.includes(to)) session.agentsUsed.push(to);
        agent = to;
        handoffs++;
        switched = true;
        break; // new agent starts fresh with the same conversation
      }

      events.push({ type: "tool_call", agent, tool: name, args, at: now() });
      const allowed = AGENTS[agent].tools.includes(name);
      const res = allowed
        ? await executeTool(name, args, ctx)
        : { ok: false, summary: `${name} not available to ${agent}`, data: { error: "Tool not available to you; hand off instead." } };
      events.push({ type: "tool_result", agent, tool: name, ok: res.ok, summary: res.summary, at: now() });
      if (res.ok && /place_order|create_booking|modify_booking|cancel_booking|join_waitlist|check_availability|lookup_caller/.test(name)) {
        session.facts.push(`${name}: ${res.summary} ${trimJson(res.data, 300)}`);
      }
      working.push(toolMessage(cfg.provider, call.id, name, { ok: res.ok, ...res.data }));
    }
    if (switched) {
      working = [];
      events.push({ type: "agent", agent, at: now() });
    }
  }
  session.activeAgent = agent;
  return { reply: "Let me connect you with a team member who can help with that.", events };
}

function toolMessage(provider: string, id: string, name: string, payload: unknown): LlmMessage {
  const m: LlmMessage = { role: "tool", tool_call_id: id, content: trimJson(payload, 4000) };
  if (provider === "gemini") m.name = name;
  return m;
}
