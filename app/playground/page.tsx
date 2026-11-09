"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { CALLERS, CrewChat, CrewTrace, useCrewChat } from "@/components/crew-chat";
import { PageHeader } from "@/components/ui";
import { VapiCallButton } from "@/components/vapi-call";
import { AGENT_META, clock, cn, useApi } from "@/lib/client";
import type { AgentId, NotificationRecord } from "@/lib/types";

const STATIONS: AgentId[] = ["receptionist", "order", "reservation", "faq"];

export default function PlaygroundPage() {
  const [caller, setCaller] = useState(CALLERS[0]);
  const chat = useCrewChat(caller.phone);
  const { data: notes, mutate: refreshNotes } = useApi<{ notifications: NotificationRecord[] }>("/api/notifications", { refreshInterval: 4000 });
  const toolResults = chat.events.filter((e) => e.type === "tool_result").length;
  useEffect(() => {
    refreshNotes();
  }, [toolResults, refreshNotes]);

  const sessionStart = chat.events[0]?.at ?? new Date().toISOString();
  const texts = (notes?.notifications ?? []).filter((n) => n.createdAt >= sessionStart).slice(0, 4);
  const toolCount = (a: AgentId) => chat.events.filter((e) => e.type === "tool_result" && e.agent === a).length;
  const visited = new Set<AgentId>(["receptionist", ...chat.events.flatMap((e) => (e.type === "handoff" ? [e.to] : []))]);

  return (
    <>
      <PageHeader
        title="Talk to the crew"
        sub="Chat or speak with the four-agent phone crew exactly as a caller would. Orders and bookings you make here go straight to the kitchen board and reservation book."
      >
        <VapiCallButton />
      </PageHeader>

      {/* Caller ID picker */}
      <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Caller ID">
        {CALLERS.map((c) => (
          <button
            key={c.id}
            role="radio"
            aria-checked={caller.id === c.id}
            onClick={() => {
              if (caller.id === c.id) return;
              setCaller(c);
              chat.reset();
            }}
            className={cn("rounded-lg border px-3.5 py-2 text-left transition-colors", caller.id === c.id ? "border-ink bg-surface" : "border-line bg-transparent hover:border-line-strong hover:bg-surface")}
          >
            <p className="text-[13.5px] font-semibold text-ink">{c.label}</p>
            <p className="text-[12px] text-muted">{c.detail}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="h-[calc(100dvh-280px)] min-h-[520px] min-w-0 overflow-hidden rounded-lg border border-line bg-paper">
          <CrewChat chat={chat} callerPhone={caller.phone} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          {/* the crew pass: four stations, the active one lit */}
          <section className="rounded-lg bg-ink p-3 text-white">
            <p className="px-1 pb-2.5 text-[13px] text-white/60">Who's on the line</p>
            <div className="grid grid-cols-4 gap-1.5">
              {STATIONS.map((a) => {
                const active = chat.agent === a;
                return (
                  <div key={a} className={cn("rounded-md px-2 py-2.5 text-center transition-colors", active ? "bg-white text-ink" : visited.has(a) ? "bg-ink-3" : "bg-ink-2")}>
                    <span className={cn("mx-auto block size-2.5 rounded-full", AGENT_META[a].color, active && "live-dot")} />
                    <p className={cn("mt-2 text-[12.5px] font-semibold", active ? "text-ink" : "text-white/85")}>{AGENT_META[a].short}</p>
                    <p className={cn("text-[11px] tabular-nums", active ? "text-muted" : "text-white/45")}>{toolCount(a)} tool {toolCount(a) === 1 ? "call" : "calls"}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex min-h-[260px] flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface xl:max-h-[calc(100dvh-560px)]">
            <h2 className="border-b border-line px-4 py-2.5 text-[14px] font-semibold">Live trace</h2>
            <div className="min-h-0 flex-1">
              <CrewTrace events={chat.events} />
            </div>
          </section>

          <section className="rounded-lg border border-line bg-surface">
            <h2 className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[14px] font-semibold">
              <MessageSquareText className="size-4 text-muted" /> Texts sent to the caller
            </h2>
            {texts.length ? (
              <ul className="divide-y divide-line">
                {texts.map((t) => (
                  <li key={t.id} className="px-4 py-2.5 text-[13px]">
                    <p className="text-ink">{t.body}</p>
                    <p className="mt-0.5 text-[11.5px] text-faint">
                      {t.channel === "whatsapp" ? "WhatsApp" : "SMS"} · {t.provider === "demo" ? "simulated (add Twilio to send)" : t.provider} · {clock(t.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-[13px] text-muted">Place an order or book a table and the confirmation text shows up here.</p>
            )}
          </section>

          {(chat.events.some((e) => e.type === "tool_result" && e.tool === "place_order" && e.ok) || chat.events.some((e) => e.type === "tool_result" && e.tool === "create_booking" && e.ok)) && (
            <div className="flex gap-2 text-[13px]">
              <Link href="/orders" className="rounded-md bg-saffron px-3 py-1.5 font-medium text-ink hover:bg-saffron-deep hover:text-white">
                See it on the kitchen board
              </Link>
              <Link href="/reservations" className="rounded-md border border-line-strong px-3 py-1.5 font-medium text-ink hover:bg-surface">
                Reservation book
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
