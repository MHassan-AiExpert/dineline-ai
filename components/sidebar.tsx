"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BookOpenText,
  CalendarDays,
  Headphones,
  LayoutGrid,
  Menu as MenuIcon,
  PhoneCall,
  Plug,
  ReceiptText,
  X,
} from "lucide-react";
import { cn, useApi } from "@/lib/client";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/orders", label: "Live orders", icon: ReceiptText },
  { href: "/reservations", label: "Reservations", icon: CalendarDays },
  { href: "/menu", label: "Menu", icon: BookOpenText },
  { href: "/calls", label: "Call log", icon: PhoneCall },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/playground", label: "Talk to the crew", icon: Headphones },
  { href: "/setup", label: "Setup", icon: Plug },
];

interface Health {
  store: string;
  crew: string;
}
interface OrdersResp {
  orders: { status: string }[];
}

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { data: health } = useApi<Health>("/api/health", { refreshInterval: 30000 });
  const { data: orders } = useApi<OrdersResp>("/api/orders", { refreshInterval: 4000 });
  const newCount = orders?.orders.filter((o) => o.status === "new").length ?? 0;
  const crewLabel = !health ? "…" : health.crew === "demo" ? "Built-in demo crew" : health.crew.split(":").slice(1).join(" · ");

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-2 text-[14.5px] transition-colors",
              active ? "bg-ink-3 text-white" : "text-white/65 hover:bg-ink-2 hover:text-white",
            )}
          >
            <Icon className={cn("size-[17px]", active ? "text-saffron" : "text-white/45 group-hover:text-white/80")} strokeWidth={1.8} />
            <span className="flex-1">{label}</span>
            {href === "/orders" && newCount > 0 && (
              <span className="rounded-full bg-chili px-1.5 py-px text-[11px] font-semibold text-white tabular-nums">{newCount}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
      <span className="grid size-8 place-items-center rounded-full bg-saffron text-ink">
        <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
          <path d="M4 14c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M2.5 17.5h19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="4" r="1.4" fill="currentColor" />
        </svg>
      </span>
      <span className="font-display text-[19px] font-semibold tracking-tight text-white">DineLine</span>
    </Link>
  );

  const footer = (
    <div className="space-y-3 border-t border-white/10 pt-4 text-[12.5px]">
      <div>
        <p className="text-white/45">Restaurant</p>
        <p className="font-medium text-white">Saffron Grill, Bleecker St</p>
      </div>
      <div>
        <p className="text-white/45">Agent brain</p>
        <p className="flex items-center gap-1.5 font-medium text-white">
          <span className={cn("size-1.5 rounded-full", health?.crew === "demo" ? "bg-saffron" : "bg-emerald-400")} />
          {crewLabel}
        </p>
      </div>
      <div>
        <p className="text-white/45">Data</p>
        <p className="font-medium text-white">{health ? (health.store === "supabase" ? "Supabase" : "Local demo store") : "…"}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[244px] flex-col gap-7 bg-ink px-4 py-5 lg:flex">
        <div className="px-1">{brand}</div>
        {nav}
        <div className="mt-auto px-1">{footer}</div>
      </aside>

      {/* mobile */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        {brand}
        <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-white" aria-label="Open navigation">
          <MenuIcon className="size-5" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] flex-col gap-7 bg-ink px-4 py-5">
            <div className="flex items-center justify-between px-1">
              {brand}
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-white/70" aria-label="Close navigation">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            <div className="mt-auto px-1">{footer}</div>
          </aside>
        </div>
      )}
    </>
  );
}
