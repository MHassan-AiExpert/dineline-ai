"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Metrics, PageHeader, Panel, Skeleton } from "@/components/ui";
import { AGENT_META, cn, duration, money, OUTCOME_LABEL, useApi } from "@/lib/client";
import type { Analytics } from "@/lib/analytics";
import type { AgentId } from "@/lib/types";

const axis = { tickLine: false, axisLine: false, tick: { fontSize: 12, fill: "#6c6882" } } as const;
const tooltip = { contentStyle: { borderRadius: 8, border: "1px solid #e2e2ec", fontSize: 13 }, labelStyle: { color: "#1c1530", fontWeight: 600 } };

export default function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const { data: a } = useApi<Analytics>(`/api/analytics?days=${days}`, { refreshInterval: 15000 });

  return (
    <>
      <PageHeader title="Analytics" sub="What the phone crew did for the restaurant: calls answered, orders and revenue captured, bookings made, and where the busy hours are.">
        <div className="flex rounded-md border border-line-strong bg-surface p-0.5" role="tablist">
          {[7, 14, 30].map((d) => (
            <button key={d} role="tab" aria-selected={days === d} onClick={() => setDays(d)} className={cn("rounded px-3 py-1 text-[13px]", days === d ? "bg-ink text-white" : "text-muted hover:text-ink")}>
              {d} days
            </button>
          ))}
        </div>
      </PageHeader>

      {!a ? (
        <Skeleton className="h-[480px]" />
      ) : (
        <>
          <Metrics
            items={[
              { label: `Calls, ${days} days`, value: a.daily.reduce((s, d) => s + d.calls, 0) },
              { label: `Orders, ${days} days`, value: a.daily.reduce((s, d) => s + d.orders, 0) },
              { label: `Revenue, ${days} days`, value: money(a.daily.reduce((s, d) => s + d.revenue, 0)) },
              { label: `Bookings, ${days} days`, value: a.daily.reduce((s, d) => s + d.reservations, 0) },
              { label: "Upsell success", value: `${Math.round(a.today.upsellRate * 100)}%` },
              { label: "Avg call today", value: duration(a.today.avgCallSeconds) },
            ]}
          />

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Panel title="Calls and orders per day">
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <LineChart data={a.daily} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e2ec" />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis {...axis} allowDecimals={false} />
                    <Tooltip {...tooltip} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12.5 }} />
                    <Line type="monotone" dataKey="calls" name="Calls" stroke="#1c1530" strokeWidth={2} dot={{ r: 2.5 }} />
                    <Line type="monotone" dataKey="orders" name="Orders" stroke="#d2453b" strokeWidth={2} dot={{ r: 2.5 }} />
                    <Line type="monotone" dataKey="reservations" name="Bookings" stroke="#2e7d5b" strokeWidth={2} dot={{ r: 2.5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="When people call">
              <div className="h-[260px]">
                <ResponsiveContainer>
                  <BarChart data={a.hourly} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e2ec" />
                    <XAxis dataKey="hour" {...axis} />
                    <YAxis {...axis} allowDecimals={false} />
                    <Tooltip {...tooltip} cursor={{ fill: "#f3f4f8" }} />
                    <Bar dataKey="calls" name="Calls" fill="#1c1530" radius={[3, 3, 0, 0]} maxBarSize={26} />
                    <Bar dataKey="orders" name="Orders" fill="#e8a013" radius={[3, 3, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Most ordered by phone">
              <ol className="space-y-2.5">
                {a.topItems.map((i, idx) => {
                  const max = a.topItems[0]?.quantity || 1;
                  return (
                    <li key={i.name} className="text-[13.5px]">
                      <div className="flex justify-between gap-3">
                        <span className="text-ink">
                          <span className="mr-2 inline-block w-4 font-mono text-faint">{idx + 1}</span>
                          {i.name}
                        </span>
                        <span className="font-mono tabular-nums text-muted">
                          {i.quantity} · {money(i.revenue)}
                        </span>
                      </div>
                      <div className="mt-1 ml-6 h-1.5 rounded-full bg-paper">
                        <div className="h-full rounded-full bg-saffron" style={{ width: `${(i.quantity / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Panel>

            <Panel title="How calls ended, and who handled them">
              <div className="grid gap-6 sm:grid-cols-2">
                <ul className="space-y-2">
                  {a.outcomes.map((o) => {
                    const total = a.outcomes.reduce((s, x) => s + x.count, 0) || 1;
                    return (
                      <li key={o.outcome} className="text-[13.5px]">
                        <div className="flex justify-between">
                          <span>{OUTCOME_LABEL[o.outcome] ?? o.outcome}</span>
                          <span className="font-mono tabular-nums text-muted">{Math.round((o.count / total) * 100)}%</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-paper">
                          <div className="h-full rounded-full bg-ink" style={{ width: `${(o.count / total) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <ul className="space-y-2">
                  {(["receptionist", "order", "reservation", "faq"] as AgentId[]).map((agent) => {
                    const v = a.agentUsage.find((x) => x.agent === agent)?.calls ?? 0;
                    const max = Math.max(1, ...a.agentUsage.map((x) => x.calls));
                    return (
                      <li key={agent} className="text-[13.5px]">
                        <div className="flex justify-between">
                          <span>{AGENT_META[agent].short} agent</span>
                          <span className="font-mono tabular-nums text-muted">{v} calls</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-paper">
                          <div className={cn("h-full rounded-full", AGENT_META[agent].color)} style={{ width: `${(v / max) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
