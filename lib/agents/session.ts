import type { AgentId, CallOutcome, CallRecord, Channel, TraceEvent, TranscriptLine } from "../types";
import type { ToolContext } from "../tools";
import { getStore } from "../store";
import type { DemoState } from "./demo-engine";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  agent?: AgentId;
}

export interface CrewSession {
  id: string;
  channel: Channel;
  callerPhone: string;
  callerName?: string;
  activeAgent: AgentId;
  history: ChatTurn[];
  /** Short notes about tool results, carried between turns so agents remember facts */
  facts: string[];
  transcript: TranscriptLine[];
  trace: TraceEvent[];
  agentsUsed: AgentId[];
  effects: ToolContext["effects"];
  demo: DemoState;
  createdAt: string;
  updatedAt: string;
}

const g = globalThis as unknown as { __dinelineSessions?: Map<string, CrewSession> };
const sessions = () => (g.__dinelineSessions ??= new Map());

export function getSession(id: string): CrewSession | undefined {
  return sessions().get(id);
}

export function createSession(id: string, channel: Channel, callerPhone: string): CrewSession {
  const now = new Date().toISOString();
  const s: CrewSession = {
    id,
    channel,
    callerPhone,
    activeAgent: "receptionist",
    history: [],
    facts: [],
    transcript: [],
    trace: [{ type: "agent", agent: "receptionist", at: now }],
    agentsUsed: ["receptionist"],
    effects: {},
    demo: { order: { items: [] }, booking: {} },
    createdAt: now,
    updatedAt: now,
  };
  sessions().set(id, s);
  // keep memory bounded
  if (sessions().size > 200) {
    const oldest = [...sessions().values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
    sessions().delete(oldest.id);
  }
  return s;
}

export function deleteSession(id: string) {
  sessions().delete(id);
}

function outcomeOf(s: CrewSession): CallOutcome {
  const o = s.effects.outcome as CallOutcome | undefined;
  if (o) return o;
  if (s.agentsUsed.includes("faq")) return "question_answered";
  return s.history.some((h) => h.role === "user") ? "question_answered" : "in_progress";
}

function summaryOf(s: CrewSession): string {
  const name = s.effects.customerName || s.callerName || "Caller";
  const toolSummaries = s.trace
    .filter((t): t is Extract<TraceEvent, { type: "tool_result" }> => t.type === "tool_result" && t.ok)
    .map((t) => t.summary);
  const key = toolSummaries.filter((t) => /placed|Booked|Moved|Cancelled|Waitlisted|Transfer/.test(t));
  if (key.length) return `${name}: ${key.join("; ")}.`;
  const firstAsk = s.history.find((h) => h.role === "user")?.content ?? "";
  return firstAsk ? `${name} asked: "${firstAsk.slice(0, 120)}"` : "Conversation started.";
}

/** Writes/updates the call log entry for this conversation so it shows in the Call Log. */
export async function syncCallRecord(s: CrewSession) {
  const record: CallRecord = {
    id: `chat-${s.id}`,
    externalId: null,
    channel: s.channel,
    callerPhone: s.callerPhone,
    callerName: s.effects.customerName || s.callerName || "",
    agents: s.agentsUsed,
    outcome: outcomeOf(s),
    summary: summaryOf(s),
    transcript: s.transcript,
    recordingUrl: null,
    durationSeconds: Math.max(1, Math.round((Date.parse(s.updatedAt) - Date.parse(s.createdAt)) / 1000)),
    cost: 0,
    orderId: s.effects.orderId ?? null,
    reservationId: s.effects.reservationId ?? null,
    createdAt: s.createdAt,
  };
  await getStore().upsertCall(record);
}
