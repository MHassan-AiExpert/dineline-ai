"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Headphones, MessageSquareText, Phone } from "lucide-react";
import { AgentChips, Empty, PageHeader, Pill, Skeleton } from "@/components/ui";
import { AGENT_META, clock, cn, duration, OUTCOME_LABEL, phone, shortDate, useApi } from "@/lib/client";
import type { CallRecord } from "@/lib/types";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "order_placed", label: "Orders" },
  { id: "reservation", label: "Bookings" },
  { id: "question_answered", label: "Questions" },
  { id: "transferred", label: "Transferred" },
  { id: "abandoned", label: "Hung up" },
];

const tone = (o: string) => (o === "order_placed" ? "chili" : o.startsWith("reservation") ? "cardamom" : o === "question_answered" ? "indigo" : o === "transferred" ? "saffron" : "neutral") as "chili" | "cardamom" | "indigo" | "saffron" | "neutral";
const ChannelIcon = ({ c }: { c: string }) => (c === "web_chat" ? <MessageSquareText className="size-3.5" /> : c === "web_voice" ? <Headphones className="size-3.5" /> : <Phone className="size-3.5" />);

function CallDetail({ id }: { id: string }) {
  const { data, isLoading } = useApi<{ call: CallRecord }>(`/api/calls/${encodeURIComponent(id)}`, { refreshInterval: 5000 });
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const c = data.call;
  return (
    <div className="flex flex-col">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={tone(c.outcome)}>{OUTCOME_LABEL[c.outcome] ?? c.outcome}</Pill>
          <AgentChips agents={c.agents} />
        </div>
        <h2 className="mt-2 font-display text-[22px] font-semibold text-ink">{c.callerName || "Unknown caller"}</h2>
        <p className="text-[13px] text-muted">
          {c.callerPhone ? phone(c.callerPhone) : "No caller ID"} · {shortDate(c.createdAt)} at {clock(c.createdAt)} · {duration(c.durationSeconds)} ·{" "}
          {c.channel === "web_chat" ? "Web chat" : c.channel === "web_voice" ? "Web voice" : "Phone"}
        </p>
        <p className="mt-3 rounded-md bg-paper px-3 py-2 text-[13.5px] text-ink">{c.summary}</p>
        {c.recordingUrl && <audio controls src={c.recordingUrl} className="mt-3 h-9 w-full" />}
      </div>
      <ol className="space-y-3 px-5 py-4">
        {c.transcript.map((t, i) => (
          <li key={i} className={cn("flex gap-3", t.role === "caller" && "flex-row-reverse")}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", t.role === "caller" ? "bg-ink" : t.agent ? AGENT_META[t.agent].color : "bg-saffron")} />
            <div className={cn("max-w-[80%]", t.role === "caller" && "text-right")}>
              <p className="text-[11.5px] text-faint">
                {t.role === "caller" ? "Caller" : t.agent ? AGENT_META[t.agent].label : "Agent"} · {clock(t.at)}
              </p>
              <p className={cn("mt-0.5 inline-block rounded-xl px-3 py-2 text-left text-[14px]", t.role === "caller" ? "bg-ink text-white" : "border border-line bg-surface text-ink")}>{t.text}</p>
            </div>
          </li>
        ))}
        {!c.transcript.length && <p className="text-[13px] text-muted">No transcript was recorded for this call.</p>}
      </ol>
    </div>
  );
}

function CallsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { data } = useApi<{ calls: (CallRecord & { lines: number })[] }>("/api/calls", { refreshInterval: 6000 });
  const [filter, setFilter] = useState("all");
  const selected = params.get("id");
  const calls = (data?.calls ?? []).filter((c) => filter === "all" || (filter === "reservation" ? c.outcome.startsWith("reservation") : c.outcome === filter));

  useEffect(() => {
    if (!selected && data?.calls[0] && window.innerWidth >= 1280) router.replace(`/calls?id=${encodeURIComponent(data.calls[0].id)}`, { scroll: false });
  }, [selected, data, router]);

  return (
    <>
      <PageHeader title="Call log" sub="Every phone call and web conversation the crew handled, with the agents involved, the outcome, an AI summary and the full transcript." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={cn("rounded-full px-3 py-1.5 text-[13px]", filter === f.id ? "bg-ink text-white" : "bg-surface ring-1 ring-line hover:ring-line-strong")}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border border-line bg-surface xl:max-h-[calc(100dvh-230px)] xl:overflow-y-auto scrollbar-thin">
          {!data ? (
            <Skeleton className="m-4 h-80" />
          ) : calls.length ? (
            <ul className="divide-y divide-line">
              {calls.map((c) => (
                <li key={c.id}>
                  <button onClick={() => router.replace(`/calls?id=${encodeURIComponent(c.id)}`, { scroll: false })} className={cn("block w-full px-4 py-3 text-left hover:bg-paper", selected === c.id && "bg-saffron-wash/60")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                        <ChannelIcon c={c.channel} />
                        {c.callerName || "Unknown caller"}
                      </span>
                      <span className="text-[12px] text-faint">
                        {shortDate(c.createdAt)} {clock(c.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{c.summary}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Pill tone={tone(c.outcome)}>{OUTCOME_LABEL[c.outcome] ?? c.outcome}</Pill>
                      <span className="font-mono text-[11.5px] text-faint">{duration(c.durationSeconds)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4">
              <Empty title="No calls match this filter" />
            </div>
          )}
        </div>
        <div className="min-h-[300px] min-w-0 overflow-hidden rounded-lg border border-line bg-surface">
          {selected ? <CallDetail id={selected} /> : <p className="px-5 py-10 text-center text-[13.5px] text-muted">Pick a call to read its transcript.</p>}
        </div>
      </div>
    </>
  );
}

export default function CallsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <CallsInner />
    </Suspense>
  );
}
