import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** ?scope=board (today + anything still open) | all */
export async function GET(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope") ?? "board";
  const store = getStore();
  if (scope === "all") return NextResponse.json({ orders: await store.listOrders({ limit: 300 }) });
  const since = new Date(Date.now() - 18 * 3600 * 1000).toISOString();
  const [recent, open] = await Promise.all([
    store.listOrders({ since, limit: 300 }),
    store.listOrders({ status: ["new", "preparing", "ready", "out_for_delivery"], limit: 200 }),
  ]);
  const byId = new Map([...open, ...recent].map((o) => [o.id, o]));
  const orders = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ orders });
}
