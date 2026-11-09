"use client";

import { useMemo, useState } from "react";
import { Flame, Search, Sparkles, Star } from "lucide-react";
import { PageHeader, Pill, Skeleton } from "@/components/ui";
import { cn, money, send, useApi } from "@/lib/client";
import type { MenuItem } from "@/lib/types";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors", on ? "bg-cardamom" : "bg-line-strong")}
    >
      <span className={cn("absolute top-[3px] size-4 rounded-full bg-white shadow transition-[left]", on ? "left-[19px]" : "left-[3px]")} />
    </button>
  );
}

function PriceEdit({ item, onSave }: { item: MenuItem; onSave: (price: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.price.toFixed(2));
  if (!editing)
    return (
      <button onClick={() => setEditing(true)} className="rounded px-1.5 py-0.5 font-mono text-[14px] font-semibold tabular-nums hover:bg-paper" title="Edit price">
        {money(item.price)}
      </button>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) return;
        await onSave(n);
        setEditing(false);
      }}
      className="flex items-center gap-1"
    >
      <span className="text-muted">$</span>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => setEditing(false)} inputMode="decimal" className="w-16 rounded border border-ink px-1.5 py-0.5 font-mono text-[13.5px] outline-none" aria-label={`Price for ${item.name}`} />
    </form>
  );
}

export default function MenuPage() {
  const { data, mutate } = useApi<{ menu: MenuItem[] }>("/api/menu");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const menu = useMemo(() => data?.menu ?? [], [data]);
  const categories = ["All", ...new Set(menu.map((m) => m.category))];
  const soldOut = menu.filter((m) => !m.isAvailable).length;

  const patch = async (item: MenuItem, p: Partial<MenuItem>) => {
    mutate((d) => (d ? { menu: d.menu.map((m) => (m.id === item.id ? { ...m, ...p } : m)) } : d), false);
    await send(`/api/menu/${item.id}`, "PATCH", p);
    mutate();
  };

  const filtered = menu.filter((m) => (cat === "All" || m.category === cat) && (!q || `${m.name} ${m.description} ${m.allergens.join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const grouped = categories.filter((c) => c !== "All").map((c) => ({ c, items: filtered.filter((m) => m.category === c) })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader title="Menu" sub="The agents read this live. Mark a dish sold out and the order agent stops offering it and suggests something similar.">
        {soldOut > 0 && <Pill tone="chili">{soldOut} sold out</Pill>}
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="flex h-9 min-w-[240px] flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 focus-within:border-ink sm:max-w-[320px]">
          <Search className="size-4 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes or allergens" className="w-full bg-transparent text-[14px] outline-none" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={cn("rounded-full px-3 py-1.5 text-[13px]", cat === c ? "bg-ink text-white" : "bg-surface text-ink ring-1 ring-line hover:ring-line-strong")}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ c, items }) => (
            <section key={c}>
              <h2 className="mb-2 font-display text-[19px] font-semibold text-ink">{c}</h2>
              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                {items.map((m) => (
                  <div key={m.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-0", !m.isAvailable && "bg-paper")}>
                    <div className="min-w-[220px] flex-1">
                      <p className={cn("flex items-center gap-1.5 text-[14.5px] font-semibold", !m.isAvailable && "text-muted line-through")}>
                        {m.name}
                        {m.spicy > 1 && <Flame className="size-3.5 text-chili" aria-label="Spicy" />}
                        {m.popular && <Star className="size-3.5 fill-saffron text-saffron" aria-label="Popular" />}
                      </p>
                      <p className="mt-0.5 text-[13px] text-muted">{m.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.allergens.map((a) => (
                          <Pill key={a} tone="chili" className="text-[11px]">
                            {a}
                          </Pill>
                        ))}
                        {m.dietary
                          .filter((d) => d !== "halal")
                          .map((d) => (
                            <Pill key={d} tone="cardamom" className="text-[11px]">
                              {d}
                            </Pill>
                          ))}
                        {m.sizes.length > 0 && <Pill className="text-[11px]">{m.sizes.map((s) => s.name).join(" / ")}</Pill>}
                      </div>
                    </div>
                    <PriceEdit item={m} onSave={(price) => patch(m, { price })} />
                    <button
                      onClick={() => patch(m, { isUpsell: !m.isUpsell })}
                      className={cn("inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium", m.isUpsell ? "bg-saffron-wash text-saffron-deep" : "text-faint hover:bg-paper hover:text-muted")}
                      title="Order agent may suggest this as an add-on"
                    >
                      <Sparkles className="size-3.5" />
                      Upsell
                    </button>
                    <label className="flex w-[118px] items-center justify-end gap-2 text-[12.5px] text-muted">
                      {m.isAvailable ? "Available" : "Sold out"}
                      <Toggle on={m.isAvailable} onChange={(v) => patch(m, { isAvailable: v })} label={`${m.name} available`} />
                    </label>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
