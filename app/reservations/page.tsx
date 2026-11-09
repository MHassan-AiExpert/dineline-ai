"use client";

import { useMemo, useState } from "react";
import { Button, Empty, PageHeader, Panel, Pill, Skeleton } from "@/components/ui";
import { cn, phone, send, to12h, useApi } from "@/lib/client";
import type { DiningTable, Reservation, ReservationStatus } from "@/lib/types";

interface Resp {
  today: string;
  reservations: Reservation[];
  tables: DiningTable[];
}

const START = 11 * 60 + 30;
const END = 23 * 60;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

const STATUS_TONE: Record<ReservationStatus, "cardamom" | "saffron" | "neutral" | "chili" | "indigo" | "ink"> = {
  booked: "indigo",
  seated: "cardamom",
  completed: "neutral",
  cancelled: "chili",
  no_show: "chili",
  waitlist: "saffron",
};
const STATUS_LABEL: Record<ReservationStatus, string> = { booked: "Booked", seated: "Seated", completed: "Finished", cancelled: "Cancelled", no_show: "No-show", waitlist: "Waitlist" };

export default function ReservationsPage() {
  const { data, mutate } = useApi<Resp>("/api/reservations", { refreshInterval: 5000 });
  const [day, setDay] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = day ?? data?.today ?? "";

  const days = useMemo(() => (data ? Array.from({ length: 7 }, (_, i) => addDays(data.today, i)) : []), [data]);
  const list = (data?.reservations ?? []).filter((r) => r.date === selected);
  const active = list.filter((r) => !["cancelled", "waitlist"].includes(r.status));
  const waitlist = list.filter((r) => r.status === "waitlist");

  const update = async (r: Reservation, status: ReservationStatus) => {
    setBusy(r.id);
    setError(null);
    try {
      await send(`/api/reservations/${r.id}`, "PATCH", { status });
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const slotMarks: number[] = [];
  for (let m = 12 * 60; m <= 22 * 60; m += 60) slotMarks.push(m);
  const pct = (m: number) => ((m - START) / (END - START)) * 100;

  return (
    <>
      <PageHeader title="Reservations" sub="Tables booked by the reservation agent, laid out by table and time. Every booking gets a text confirmation and a reminder two hours before." />

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin" role="tablist" aria-label="Day">
        {days.map((d, i) => {
          const count = (data?.reservations ?? []).filter((r) => r.date === d && !["cancelled", "waitlist"].includes(r.status)).length;
          const dt = new Date(`${d}T12:00:00Z`);
          return (
            <button
              key={d}
              role="tab"
              aria-selected={selected === d}
              onClick={() => setDay(d)}
              className={cn("min-w-[92px] rounded-lg border px-3 py-2 text-left", selected === d ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-line-strong")}
            >
              <p className="text-[12px] opacity-70">{i === 0 ? "Today" : i === 1 ? "Tomorrow" : dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}</p>
              <p className="font-display text-[17px] font-semibold">{dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</p>
              <p className="text-[11.5px] opacity-70">{count} bookings</p>
            </button>
          );
        })}
      </div>

      {error && <p className="mb-4 rounded-md bg-chili-wash px-3 py-2 text-[13.5px] text-chili">{error}</p>}

      {/* Floor timeline */}
      <Panel title="Floor plan by time" bodyClass="p-0">
        {!data ? (
          <Skeleton className="m-4 h-64" />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[860px] px-4 pt-3 pb-4">
              <div className="relative ml-[104px] h-6 text-[11.5px] text-muted">
                {slotMarks.map((m) => (
                  <span key={m} className="absolute -translate-x-1/2" style={{ left: `${pct(m)}%` }}>
                    {to12h(`${String(Math.floor(m / 60)).padStart(2, "0")}:00`).replace(":00", "")}
                  </span>
                ))}
              </div>
              {data.tables.map((t) => {
                const rows = active.filter((r) => r.tableId === t.id);
                return (
                  <div key={t.id} className="flex h-10 items-center border-t border-line">
                    <div className="w-[104px] shrink-0 text-[12.5px]">
                      <span className="font-semibold text-ink">Table {t.number}</span>
                      <span className="text-muted"> · {t.seats}</span>
                      <span className="block text-[11px] capitalize text-faint">{t.area}</span>
                    </div>
                    <div className="relative h-full flex-1">
                      {slotMarks.map((m) => (
                        <span key={m} className="absolute inset-y-0 border-l border-line/70" style={{ left: `${pct(m)}%` }} />
                      ))}
                      {rows.map((r) => {
                        const s = toMin(r.time);
                        return (
                          <div
                            key={r.id}
                            title={`${r.customerName} · ${r.partySize} guests · ${to12h(r.time)}`}
                            className={cn(
                              "absolute top-1.5 bottom-1.5 flex items-center overflow-hidden rounded px-2 text-[12px] font-medium",
                              r.status === "seated" ? "bg-cardamom text-white" : r.status === "booked" ? "bg-indigo-wash text-indigo ring-1 ring-indigo/25" : r.status === "no_show" ? "bg-chili-wash text-chili line-through" : "bg-paper text-faint",
                            )}
                            style={{ left: `${pct(s)}%`, width: `${pct(s + 90) - pct(s)}%` }}
                          >
                            <span className="truncate">
                              {r.customerName.split(" ")[0]} · {r.partySize}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title={`Bookings (${active.length})`} bodyClass="p-0">
          {!data ? (
            <Skeleton className="m-4 h-40" />
          ) : active.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13.5px]">
                <thead className="border-b border-line text-[12.5px] text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Time</th>
                    <th className="px-4 py-2.5 font-medium">Guest</th>
                    <th className="px-4 py-2.5 font-medium">Party</th>
                    <th className="px-4 py-2.5 font-medium">Table</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {active.map((r) => {
                    const table = data.tables.find((t) => t.id === r.tableId);
                    return (
                      <tr key={r.id} className="border-b border-line last:border-0">
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono font-semibold">{to12h(r.time)}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{r.customerName}</p>
                          <p className="text-[12px] text-muted">
                            {phone(r.customerPhone)} · {r.code}
                            {r.occasion && ` · ${r.occasion}`}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">{r.partySize}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">{table ? `T${table.number} · ${table.area}` : "—"}</td>
                        <td className="px-4 py-2.5">
                          <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1 whitespace-nowrap">
                            {r.status === "booked" && (
                              <>
                                <Button size="sm" variant="primary" disabled={busy === r.id} onClick={() => update(r, "seated")}>
                                  Seat
                                </Button>
                                <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => update(r, "no_show")}>
                                  No-show
                                </Button>
                                <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => update(r, "cancelled")}>
                                  Cancel
                                </Button>
                              </>
                            )}
                            {r.status === "seated" && (
                              <Button size="sm" disabled={busy === r.id} onClick={() => update(r, "completed")}>
                                Finish
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4">
              <Empty title="No bookings for this day">Ask the crew for a table from the chat and it will appear here.</Empty>
            </div>
          )}
        </Panel>

        <Panel title={`Waitlist (${waitlist.length})`} bodyClass="p-0">
          {waitlist.length ? (
            <ul className="divide-y divide-line">
              {waitlist.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-[13.5px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {r.customerName} <span className="text-muted">· {r.partySize}</span>
                    </p>
                    <p className="text-[12px] text-muted">
                      wants {to12h(r.time)} · {phone(r.customerPhone)}
                    </p>
                  </div>
                  <Button size="sm" disabled={busy === r.id} onClick={() => update(r, "booked")}>
                    Offer table
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-center text-[13px] text-muted">Nobody is waiting for this day.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
