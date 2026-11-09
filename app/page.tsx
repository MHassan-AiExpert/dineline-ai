"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AgentChips, Empty, Metrics, PageHeader, Panel, Pill, Skeleton } from "@/components/ui";
import { ago, clock, duration, money, OUTCOME_LABEL, to12h, useApi, TZ } from "@/lib/client";
import type { Analytics } from "@/lib/analytics";
import type { CallRecord, Order, Reservation } from "@/lib/types";

const outcomeTone = (o: string) => (o === "order_placed" ? "chili" : o.startsWith("reservation") ? "cardamom" : o === "question_answered" ? "indigo" : "neutral") as "chili" | "cardamom" | "indigo" | "neutral";

export default function Overview() {
  const { data: a } = useApi<Analytics>("/api/analytics?days=7", { refreshInterval: 10000 });
  const { data: o } = useApi<{ orders: Order[] }>("/api/orders", { refreshInterval: 4000 });
  const { data: c } = useApi<{ calls: (CallRecord & { lines: number })[] }>("/api/calls", { refreshInterval: 6000 });
  const { data: r } = useApi<{ today: string; reservations: Reservation[] }>("/api/reservations", { refreshInterval: 10000 });

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ });
  const open = (o?.orders ?? []).filter((x) => ["new", "preparing", "ready", "out_for_delivery"].includes(x.status));
  const tonight = (r?.reservations ?? []).filter((x) => x.date === r?.today && ["booked", "seated", "waitlist"].includes(x.status));

  return (
    <>
      <PageHeader title="Tonight at Saffron Grill" sub={`${today} · the AI phone crew is answering every call.`} />

      {a ? (
        <Metrics
          items={[
            { label: "Calls handled today", value: a.today.calls, note: `${Math.round(a.today.aiHandledRate * 100)}% resolved without staff` },
            { label: "Phone orders", value: a.today.orders, note: `avg ticket ${money(a.today.avgTicket)}` },
            { label: "Revenue captured", value: money(a.today.revenue), note: "orders taken by the crew" },
            { label: "Tables booked", value: a.today.reservations, note: `${a.today.covers} covers today` },
            { label: "Upsell success", value: `${Math.round(a.today.upsellRate * 100)}%`, note: "last 7 days" },
            { label: "Avg call length", value: duration(a.today.avgCallSeconds), note: "minutes:seconds" },
          ]}
        />
      ) : (
        <Skeleton className="h-[92px]" />
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="On the pass"
            action={
              <Link href="/orders" className="text-[13px] font-medium text-saffron-deep hover:underline">
                Open kitchen board
              </Link>
            }
          >
            {!o ? (
              <Skeleton className="h-24" />
            ) : open.length ? (
              <ul className="divide-y divide-line">
                {open.slice(0, 6).map((x) => (
                  <li key={x.id} className="flex items-center gap-3 py-2.5 text-[13.5px]">
                    <span className="w-14 font-mono font-bold">#{x.orderNumber}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">
                      <span className="text-ink">{x.customerName}</span> · {x.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                    </span>
                    <Pill tone={x.status === "new" ? "chili" : x.status === "preparing" ? "saffron" : "cardamom"}>
                      {x.status === "new" ? "New" : x.status === "preparing" ? "Cooking" : x.status === "ready" ? "Ready" : "Out for delivery"}
                    </Pill>
                    <span className="w-12 text-right font-mono text-[12px] text-muted">{ago(x.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="The pass is clear">New phone orders appear here the moment the order agent confirms them.</Empty>
            )}
          </Panel>

          <Panel title="Revenue taken by phone, last 7 days">
            <div className="h-[230px]">
              {a ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.daily} margin={{ top: 6, right: 4, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e2ec" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6c6882" }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6c6882" }} tickFormatter={(v) => `$${Math.round(v / 100) / 10}k`} />
                    <Tooltip cursor={{ fill: "#f3f4f8" }} formatter={(v) => [money(Number(v)), "Revenue"]} labelStyle={{ color: "#1c1530" }} contentStyle={{ borderRadius: 8, border: "1px solid #e2e2ec", fontSize: 13 }} />
                    <Bar dataKey="revenue" fill="#e8a013" radius={[4, 4, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Skeleton className="h-full" />
              )}
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Latest calls"
            action={
              <Link href="/calls" className="text-[13px] font-medium text-saffron-deep hover:underline">
                Call log
              </Link>
            }
            bodyClass="p-0"
          >
            {!c ? (
              <Skeleton className="m-4 h-40" />
            ) : (
              <ul className="divide-y divide-line">
                {c.calls.slice(0, 6).map((call) => (
                  <li key={call.id}>
                    <Link href={`/calls?id=${encodeURIComponent(call.id)}`} className="block px-4 py-3 hover:bg-paper">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13.5px] font-semibold text-ink">{call.callerName || "Unknown caller"}</span>
                        <span className="text-[12px] text-faint">{clock(call.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{call.summary}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Pill tone={outcomeTone(call.outcome)}>{OUTCOME_LABEL[call.outcome] ?? call.outcome}</Pill>
                        <AgentChips agents={call.agents} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Tonight's book"
            action={
              <Link href="/reservations" className="text-[13px] font-medium text-saffron-deep hover:underline">
                Reservations
              </Link>
            }
            bodyClass="p-0"
          >
            {!r ? (
              <Skeleton className="m-4 h-32" />
            ) : tonight.length ? (
              <ul className="divide-y divide-line">
                {tonight.slice(0, 7).map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                    <span className="w-[68px] font-mono text-[12.5px] font-semibold">{to12h(x.time)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {x.customerName} <span className="text-muted">· party of {x.partySize}</span>
                    </span>
                    {x.occasion && <Pill tone="saffron">{x.occasion}</Pill>}
                    {x.status === "waitlist" && <Pill tone="neutral">Waitlist</Pill>}
                    {x.status === "seated" && <Pill tone="cardamom">Seated</Pill>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4">
                <Empty title="No bookings yet tonight" />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
