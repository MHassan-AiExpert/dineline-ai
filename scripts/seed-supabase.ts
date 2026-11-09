/**
 * Loads a week of demo history (customers, orders, bookings, calls, texts) into Supabase.
 * Run supabase/schema.sql and supabase/seed.sql first.
 * Usage: npm run seed:supabase      (reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local)
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { buildDemoHistory } from "../lib/seed";
import { callTo, notificationTo, orderTo, reservationTo } from "../lib/store/supabase";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const h = buildDemoHistory();

  const step = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await run();
    if (error) throw new Error(`${label}: ${error.message}`);
    console.log(`✓ ${label}`);
  };

  // clear previous demo history (menu, tables and settings stay)
  for (const table of ["order_items", "notifications", "calls", "reservations", "orders", "customers"]) {
    await step(`cleared ${table}`, () => sb.from(table).delete().neq(table === "order_items" ? "order_id" : "id", "__none__"));
  }

  await step(`${h.customers.length} customers`, () =>
    sb.from("customers").insert(h.customers.map((c) => ({ id: c.id, phone: c.phone, name: c.name, total_orders: c.totalOrders, last_order_id: c.lastOrderId, notes: c.notes, created_at: c.createdAt }))),
  );
  await step(`${h.orders.length} orders`, () => sb.from("orders").insert(h.orders.map((o) => ({ ...orderTo(o), updated_at: o.updatedAt }))));
  await step("order line items", () =>
    sb.from("order_items").insert(
      h.orders.flatMap((o) =>
        o.items.map((i) => ({ order_id: o.id, menu_item_id: i.menuItemId, name: i.name, quantity: i.quantity, size: i.size, add_ons: i.addOns, notes: i.notes, unit_price: i.unitPrice, line_total: i.lineTotal })),
      ),
    ),
  );
  await step(`${h.reservations.length} reservations`, () => sb.from("reservations").insert(h.reservations.map((r) => ({ ...reservationTo(r), updated_at: r.updatedAt }))));
  await step(`${h.calls.length} calls`, () => sb.from("calls").insert(h.calls.map(callTo)));
  await step(`${h.notifications.length} texts`, () => sb.from("notifications").insert(h.notifications.map(notificationTo)));

  await step("order number sequence", () => sb.rpc("sync_order_number"));
  console.log(`\nDone. New orders start at #${h.nextOrderNumber}.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
