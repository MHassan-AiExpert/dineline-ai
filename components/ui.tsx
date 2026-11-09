"use client";

import type { ReactNode, ButtonHTMLAttributes } from "react";
import { AGENT_META, cn } from "@/lib/client";
import type { AgentId } from "@/lib/types";

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink sm:text-[34px]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-[68ch] text-[14.5px] text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Panel({ title, action, children, className, bodyClass }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn("rounded-lg border border-line bg-surface shadow-[var(--shadow-panel)]", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[14.5px] font-semibold text-ink">{title}</h2>
          {action}
        </div>
      )}
      <div className={cn("p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-[14px]",
        variant === "primary" && "bg-ink text-white hover:bg-ink-2",
        variant === "secondary" && "border border-line-strong bg-surface text-ink hover:bg-paper",
        variant === "ghost" && "text-muted hover:bg-paper hover:text-ink",
        variant === "danger" && "border border-chili/30 bg-chili-wash text-chili hover:bg-chili hover:text-white",
        className,
      )}
    />
  );
}

export function Pill({ tone = "neutral", children, className }: { tone?: "neutral" | "saffron" | "chili" | "cardamom" | "indigo" | "ink"; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium",
        tone === "neutral" && "bg-paper text-muted ring-1 ring-line",
        tone === "saffron" && "bg-saffron-wash text-saffron-deep",
        tone === "chili" && "bg-chili-wash text-chili",
        tone === "cardamom" && "bg-cardamom-wash text-cardamom",
        tone === "indigo" && "bg-indigo-wash text-indigo",
        tone === "ink" && "bg-ink text-white",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AgentDot({ agent, className }: { agent: AgentId; className?: string }) {
  return <span className={cn("inline-block size-2 rounded-full", AGENT_META[agent].color, className)} />;
}

export function AgentChips({ agents }: { agents: AgentId[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {agents.map((a, i) => (
        <span key={`${a}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-faint">›</span>}
          <span className={cn("rounded px-1.5 py-px text-[11.5px] font-medium", AGENT_META[a].wash, AGENT_META[a].text)}>{AGENT_META[a].short}</span>
        </span>
      ))}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-[46ch] text-[13.5px] text-muted">{children}</div>}
    </div>
  );
}

/** A row of headline numbers separated by hairlines, read like a restaurant's nightly sheet. */
export function Metrics({ items }: { items: { label: string; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
      {items.map((m) => (
        <div key={m.label} className="bg-surface px-4 py-3.5">
          <p className="text-[12.5px] text-muted">{m.label}</p>
          <p className="mt-1 font-display text-[26px] font-semibold leading-none tracking-tight text-ink tabular-nums">{m.value}</p>
          {m.note && <p className="mt-1.5 text-[12px] text-faint">{m.note}</p>}
        </div>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-line/70", className)} />;
}
