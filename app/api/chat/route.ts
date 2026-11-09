import { NextResponse } from "next/server";
import { runCrewTurn, startConversation } from "@/lib/agents/crew";
import { deleteSession } from "@/lib/agents/session";
import { bad, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  sessionId?: string;
  message?: string;
  callerPhone?: string;
  action?: "start" | "message" | "end";
}

/** Web chat entry point for the agent crew (used by the dashboard chatbot). */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body?.sessionId || !/^[\w-]{6,80}$/.test(body.sessionId)) return bad("A sessionId is required.");
  const callerPhone = (body.callerPhone ?? "").replace(/[^\d+]/g, "").slice(0, 16);

  if (body.action === "end") {
    deleteSession(body.sessionId);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "start") {
    return NextResponse.json(await startConversation({ sessionId: body.sessionId, callerPhone }));
  }
  const message = body.message?.trim();
  if (!message) return bad("Type a message to send.");
  return NextResponse.json(await runCrewTurn({ sessionId: body.sessionId, message, callerPhone }));
}
