"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Ticket } from "@/components/ticket";
import { Button, Empty, PageHeader, Pill, Skeleton } from "@/components/ui";
import { ago, clock, cn, money, send, useApi } from "@/lib/client";
import type { Order, OrderStatus } from "@/lib/types";

const COLUMNS: { id: string; title: string; statuses: OrderStatus[]; tone: string }[] = [
  { id: "new", title: "New", statuses: ["new"], tone: "bg-chili" },
  { id: "preparing", title: "On the line", statuses: ["preparing"], tone: "bg-saffron" },
  { id: "ready", title: "Ready & out", statuses: ["ready", "out_for_delivery"], tone: "bg-cardamom" },
];

function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.16);
      o.stop(ctx.currentTime + i * 0.16 + 0.4);
    });
  } catch {
    /* audio blocked until the user interacts */
  }
}

export default function OrdersPage() {
  const { data, mutate, isLoading } = useApi<{ orders: Order[] }>("/api/orders", { refreshInterval: 3000 });
  const [sound, setSound] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.orders.map((o) => o.id));
    if (seen.current) {
      const arrived = data.orders.filter((o) => !seen.current!.has(o.id) && o.status === "new").map((o) => o.id);
      if (arrived.length) {
        setFresh(new Set(arrived));
        if (sound) chime();
        setTimeout(() => setFresh(new Set()), 1500);
      }
    }
    seen.current = ids;
  }, [data, sound]);

  const move = async (order: Order, to: OrderStatus) => {
    setBusyId(order.id);
    mutate((d) => (d ? { orders: d.orders.map((o) => (o.id === order.id ? { ...o, status: to } : o)) } : d), false);
    try {
      await send(`/api/orders/${order.id}`, "PATCH", { status: to });
    } finally {
      setBusyId(null);
      mutate();
    }
  };

  const orders = useMemo(() => data?.orders ?? [], [data]);
  const done = orders.filter((o) => o.status === "completed" || o.status === "cancelled").slice(0, 12);
  const openCount = orders.filter((o) => ["new", "preparing", "ready", "out_for_delivery"].includes(o.status)).length;

  return (
    <>
      <PageHeader title="Live orders" sub="Every order the phone crew confirms lands here as a ticket. Moving a ticket texts the customer automatically.">
        <span className="flex items-center gap-2 text-[13px] text-muted">
          <span className="live-dot size-2 rounded-full bg-saffron" /> {openCount} open
        </span>
        <Button variant="ghost" size="sm" onClick={() => setSound((s) => !s)} aria-pressed={sound}>
          {sound ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          {sound ? "Chime on" : "Chime off"}
        </Button>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => col.statuses.includes(o.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          return (
            <section key={col.id} className="flex min-h-[200px] flex-col rounded-lg bg-[#e9eaf1] p-2.5">
              {/* the pass rail */}
              <div className="mb-2 flex items-center justify-between rounded-md bg-ink px-3 py-2 text-white">
                <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                  <span className={cn("size-2 rounded-full", col.tone)} />
                  {col.title}
                </h2>
                <span className="font-mono text-[13px] tabular-nums text-white/70">{list.length}</span>
              </div>
              <div className="flex flex-col gap-3 px-0.5 pt-1.5">
                {isLoading && !data ? (
                  <>
                    <Skeleton className="h-40" />
                    <Skeleton className="h-32" />
                  </>
                ) : list.length ? (
                  list.map((o) => <Ticket key={o.id} order={o} fresh={fresh.has(o.id)} busy={busyId === o.id} onMove={(to) => move(o, to)} />)
                ) : (
                  <p className="px-2 py-8 text-center text-[13px] text-muted">{col.id === "new" ? "Waiting for the next call. Try ordering from the chat." : "Nothing here right now."}</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-[18px] font-semibold text-ink">Recently closed</h2>
        {done.length ? (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-[13.5px]">
              <thead className="border-b border-line text-[12.5px] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Items</th>
                  <th className="px-4 py-2.5 font-medium">Placed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {done.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      #{o.orderNumber} {o.status === "cancelled" && <Pill tone="chili">Cancelled</Pill>}
                    </td>
                    <td className="px-4 py-2.5">{o.customerName}</td>
                    <td className="max-w-[320px] truncate px-4 py-2.5 text-muted">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {clock(o.createdAt)} <span className="text-faint">({ago(o.createdAt)} ago)</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No closed orders yet today" />
        )}
      </section>
    </>
  );
}
