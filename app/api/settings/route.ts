import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { llmConfig } from "@/lib/agents/llm";

export const dynamic = "force-dynamic";

/** Restaurant settings plus which integrations are configured (never returns secrets). */
export async function GET() {
  const store = getStore();
  const settings = await store.getSettings();
  const cfg = llmConfig();
  return NextResponse.json({
    settings,
    integrations: {
      store: store.kind,
      llm: cfg ? { provider: cfg.provider, model: cfg.model } : null,
      vapi: { server: !!process.env.VAPI_PRIVATE_KEY, web: !!process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY, squadId: process.env.NEXT_PUBLIC_VAPI_SQUAD_ID || null },
      twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      n8n: !!process.env.N8N_NOTIFY_WEBHOOK_URL,
      webhookSecret: !!process.env.DINELINE_WEBHOOK_SECRET,
      publicUrl: process.env.PUBLIC_APP_URL || null,
    },
  });
}

export async function PATCH(req: Request) {
  const patch = await req.json().catch(() => null);
  if (!patch || typeof patch !== "object") return NextResponse.json({ error: "Send a JSON object of settings to change." }, { status: 400 });
  return NextResponse.json({ settings: await getStore().updateSettings(patch) });
}
