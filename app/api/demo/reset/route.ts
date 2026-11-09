import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { resetLocalDb } from "@/lib/store/local";

/** Restores the local demo data (no effect when Supabase is connected). */
export async function POST() {
  if (getStore().kind !== "local") return NextResponse.json({ error: "Reset only applies to the local demo store." }, { status: 400 });
  resetLocalDb();
  return NextResponse.json({ ok: true });
}
