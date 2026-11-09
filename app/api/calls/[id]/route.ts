import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await getStore().getCall(id);
  return call ? NextResponse.json({ call }) : NextResponse.json({ error: "Call not found." }, { status: 404 });
}
