import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { llmConfig } from "@/lib/agents/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = llmConfig();
  return NextResponse.json({
    ok: true,
    store: getStore().kind,
    crew: cfg ? `llm:${cfg.provider}:${cfg.model}` : "demo",
    time: new Date().toISOString(),
  });
}
