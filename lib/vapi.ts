import type { AgentId, CallOutcome, CallRecord, TranscriptLine } from "./types";
import { executeTool, type ToolContext } from "./tools";
import { getStore } from "./store";
import { AGENTS } from "./agents/definitions";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Tracks what each live phone call has done (order placed, booking made…) until its end-of-call report. */
interface LiveCall {
  callerPhone: string;
  agents: Set<AgentId>;
  effects: ToolContext["effects"];
  toolLog: string[];
  startedAt: string;
}
const g = globalThis as unknown as { __dinelineLiveCalls?: Map<string, LiveCall> };
const live = () => (g.__dinelineLiveCalls ??= new Map());

function liveCall(callId: string, callerPhone: string): LiveCall {
  let c = live().get(callId);
  if (!c) {
    c = { callerPhone, agents: new Set(["receptionist"]), effects: {}, toolLog: [], startedAt: new Date().toISOString() };
    live().set(callId, c);
  }
  return c;
}

function agentForTool(tool: string, assistantName?: string): AgentId {
  const byName = Object.values(AGENTS).find((a) => assistantName && assistantName.toLowerCase().includes(a.id));
  if (byName) return byName.id;
  return (Object.values(AGENTS).find((a) => a.tools.includes(tool) && a.id !== "receptionist")?.id ?? "receptionist") as AgentId;
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw as Record<string, unknown>;
}

/** Handles Vapi's "tool-calls" server message and returns { results: [...] } in Vapi's format. */
export async function handleVapiToolCalls(body: any) {
  const message = body?.message ?? body;
  const call = message?.call ?? {};
  const callId: string = call.id ?? `vapi-${Date.now()}`;
  const callerPhone: string = call.customer?.number ?? message?.customer?.number ?? "";
  const lc = liveCall(callId, callerPhone);
  const list: any[] = message?.toolCallList ?? message?.toolCalls ?? message?.toolWithToolCallList?.map((t: any) => t.toolCall) ?? [];
  const assistantName: string | undefined = message?.assistant?.name;

  const results = [];
  for (const tc of list) {
    const name: string = tc.function?.name ?? tc.name;
    const args = parseArgs(tc.function?.arguments ?? tc.arguments ?? tc.parameters);
    const agent = agentForTool(name, assistantName);
    lc.agents.add(agent);
    const res = await executeTool(name, args, { callerPhone, channel: "phone", sessionId: callId, effects: lc.effects });
    lc.toolLog.push(`${name}: ${res.summary}`);
    results.push({ toolCallId: tc.id, name, result: JSON.stringify({ ok: res.ok, ...res.data }) });
  }
  return { results };
}

/** Executes a single tool by name — used by the n8n tool workflows (01–03). */
export async function handleGatewayTool(body: any) {
  const name = String(body?.name ?? body?.tool ?? "");
  const args = parseArgs(body?.args ?? body?.arguments);
  const callId = String(body?.callId ?? `n8n-${Date.now()}`);
  const callerPhone = String(body?.callerPhone ?? "");
  const lc = liveCall(callId, callerPhone);
  lc.agents.add(agentForTool(name));
  const res = await executeTool(name, args, { callerPhone, channel: "phone", sessionId: callId, effects: lc.effects });
  lc.toolLog.push(`${name}: ${res.summary}`);
  return res;
}

function mapTranscript(message: any): TranscriptLine[] {
  const msgs: any[] = message?.artifact?.messages ?? message?.messages ?? [];
  const lines: TranscriptLine[] = [];
  for (const m of msgs) {
    const role = m.role === "user" ? "caller" : m.role === "bot" || m.role === "assistant" ? "agent" : null;
    const text = m.message ?? m.content;
    if (!role || !text || typeof text !== "string") continue;
    const at = m.time ? new Date(m.time).toISOString() : new Date().toISOString();
    lines.push({ role, text, at });
  }
  if (!lines.length) {
    const raw: string = message?.artifact?.transcript ?? message?.transcript ?? "";
    for (const row of raw.split("\n")) {
      const m = row.match(/^(AI|User|Assistant|Bot)\s*:\s*(.*)$/i);
      if (m) lines.push({ role: /user/i.test(m[1]) ? "caller" : "agent", text: m[2], at: new Date().toISOString() });
    }
  }
  return lines;
}

/** Stores Vapi's end-of-call report in the call log. */
export async function handleEndOfCallReport(body: any) {
  const message = body?.message ?? body;
  const call = message?.call ?? {};
  const callId: string = call.id ?? message?.callId ?? `vapi-${Date.now()}`;
  const callerPhone: string = call.customer?.number ?? message?.customer?.number ?? "";
  const lc = live().get(callId);
  const effects = lc?.effects ?? {};
  const durationSeconds = Math.round(Number(message?.durationSeconds ?? (message?.endedAt && message?.startedAt ? (Date.parse(message.endedAt) - Date.parse(message.startedAt)) / 1000 : 0)));
  const ended: string = message?.endedReason ?? "";
  let outcome = (effects.outcome as CallOutcome | undefined) ?? (lc?.agents.has("faq") ? "question_answered" : undefined);
  if (!outcome) outcome = /forward|transfer/.test(ended) ? "transferred" : durationSeconds < 20 ? "abandoned" : "question_answered";

  const record: CallRecord = {
    id: `vapi-${callId}`,
    externalId: callId,
    channel: call.type === "webCall" ? "web_voice" : "phone",
    callerPhone,
    callerName: effects.customerName ?? "",
    agents: lc ? [...lc.agents] : ["receptionist"],
    outcome,
    summary: message?.analysis?.summary ?? message?.summary ?? (lc?.toolLog.length ? lc.toolLog.slice(-3).join("; ") : "Call completed."),
    transcript: mapTranscript(message),
    recordingUrl: message?.artifact?.recordingUrl ?? message?.recordingUrl ?? message?.artifact?.recording?.mono?.combinedUrl ?? null,
    durationSeconds,
    cost: Number(message?.cost ?? 0),
    orderId: effects.orderId ?? null,
    reservationId: effects.reservationId ?? null,
    createdAt: message?.startedAt ?? lc?.startedAt ?? new Date().toISOString(),
  };
  await getStore().upsertCall(record);
  live().delete(callId);
  return record;
}
