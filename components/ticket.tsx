"use client";

import { Bike, MessageSquareText, Phone, ShoppingBag, Mic } from "lucide-react";
import type { Order, OrderStatus } from "@/lib/types";
import { ago, clock, cn, money, phone } from "@/lib/client";

const NEXT: Partial<Record<OrderStatus, { label: string; to: OrderStatus }>> = {
  new: { label: "Start cooking", to: "preparing" },
  preparing: { label: "Mark ready", to: "ready" },
  ready: { label: "Hand over", to: "completed" },
  out_for_delivery: { label: "Delivered", to: "completed" },
};

const CHANNEL_ICON = { phone: Phone, web_chat: MessageSquareText, web_voice: Mic };

export function Ticket({ order, onMove, fresh, busy }: { order: Order; onMove: (to: OrderStatus) => void; fresh?: boolean; busy?: boolean }) {
  const age = (Date.now() - Date.parse(order.createdAt)) / 60000;
  const late = (order.status === "new" && age > 6) || (order.status === "preparing" && Date.now() > Date.parse(order.readyAt));
  let next = NEXT[order.status];
  if (order.status === "preparing" && order.type === "delivery") next = { label: "Send out", to: "out_for_delivery" };
  const ChannelIcon = CHANNEL_ICON[order.channel] ?? Phone;

  return (
    <article className={cn("ticket mt-1.5 px-3.5 pt-3 pb-3", fresh && "ticket-land", order.status === "new" && "ring-1 ring-chili/40")}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[22px] leading-none font-bold tracking-tight text-ink">#{order.orderNumber}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
            <ChannelIcon className="size-3" />
            {clock(order.createdAt)} · {order.customerName}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-semibold", order.type === "delivery" ? "bg-indigo-wash text-indigo" : "bg-cardamom-wash text-cardamom")}>
            {order.type === "delivery" ? <Bike className="size-3" /> : <ShoppingBag className="size-3" />}
            {order.type === "delivery" ? "Delivery" : "Pickup"}
          </span>
          <span className={cn("font-mono text-[12px] tabular-nums", late ? "font-bold text-chili" : "text-muted")}>{ago(order.createdAt)}</span>
        </div>
      </header>

      <ul className="ticket-rule mt-2.5 space-y-1 pt-2.5 font-mono text-[13px] leading-snug text-ink">
        {order.items.map((i, idx) => (
          <li key={idx}>
            <span className="flex gap-2">
              <span className="w-5 shrink-0 font-bold">{i.quantity}×</span>
              <span className="flex-1">
                {i.name}
                {i.size && i.size !== "Regular" && <span className="text-muted"> ({i.size})</span>}
              </span>
            </span>
            {(i.notes || i.addOns.length > 0) && <span className="ml-7 block text-[12px] font-bold text-chili">{[...i.addOns, i.notes].filter(Boolean).join(" · ")}</span>}
          </li>
        ))}
      </ul>

      <div className="ticket-rule mt-2.5 flex items-center justify-between pt-2 text-[12px]">
        <span className="text-muted">
          {order.type === "delivery" && order.address ? <span className="line-clamp-1">{order.address}</span> : <>Ready {clock(order.readyAt)}</>}
        </span>
        <span className="font-mono font-bold text-ink tabular-nums">{money(order.total)}</span>
      </div>

      {next && (
        <div className="mt-2.5 flex gap-1.5">
          <button
            disabled={busy}
            onClick={() => onMove(next!.to)}
            className={cn(
              "h-8 flex-1 rounded-md text-[13px] font-semibold transition-colors disabled:opacity-50",
              order.status === "new" ? "bg-chili text-white hover:bg-chili/90" : order.status === "preparing" ? "bg-saffron text-ink hover:bg-saffron-deep hover:text-white" : "bg-ink text-white hover:bg-ink-2",
            )}
          >
            {next.label}
          </button>
          <a href={`tel:${order.customerPhone}`} className="grid h-8 w-8 place-items-center rounded-md border border-line-strong text-muted hover:text-ink" title={`Call ${phone(order.customerPhone)}`}>
            <Phone className="size-3.5" />
          </a>
        </div>
      )}
    </article>
  );
}
