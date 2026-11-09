import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import type { MenuItem } from "@/lib/types";

const EDITABLE: (keyof MenuItem)[] = ["name", "description", "price", "isAvailable", "isUpsell", "popular", "allergens", "dietary", "spicy"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Partial<MenuItem>;
  const patch: Partial<MenuItem> = {};
  for (const k of EDITABLE) if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k];
  if (patch.price !== undefined && (!Number.isFinite(Number(patch.price)) || Number(patch.price) < 0)) {
    return NextResponse.json({ error: "Price must be a positive number." }, { status: 400 });
  }
  if (patch.price !== undefined) patch.price = Math.round(Number(patch.price) * 100) / 100;
  const item = await getStore().updateMenuItem(id, patch);
  if (!item) return NextResponse.json({ error: "Menu item not found." }, { status: 404 });
  return NextResponse.json({ item });
}
