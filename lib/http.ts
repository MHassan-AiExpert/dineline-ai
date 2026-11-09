import { NextResponse } from "next/server";

/** Checks the shared secret sent by n8n (x-dineline-secret) or Vapi (x-vapi-secret). */
export function authorized(req: Request): boolean {
  const secret = process.env.DINELINE_WEBHOOK_SECRET?.trim();
  if (!secret) return true;
  const sent = req.headers.get("x-dineline-secret") ?? req.headers.get("x-vapi-secret") ?? "";
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return sent === secret || bearer === secret;
}

export function unauthorized() {
  return NextResponse.json({ error: "Missing or wrong x-dineline-secret header." }, { status: 401 });
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
