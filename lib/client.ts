"use client";

import useSWR, { type SWRConfiguration } from "swr";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AgentId } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export function useApi<T>(url: string | null, opts?: SWRConfiguration<T>) {
  return useSWR<T>(url, fetcher, { revalidateOnFocus: true, ...opts });
}

export async function send<T = unknown>(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}

export const TZ = "America/New_York";

export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function clock(iso: string, tz = TZ) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

export function shortDate(iso: string, tz = TZ) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
}

export function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d`;
}

export function duration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}

export function to12h(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function phone(p: string) {
  const d = p.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p;
}

export const AGENT_META: Record<AgentId, { label: string; short: string; color: string; wash: string; text: string; role: string }> = {
  receptionist: { label: "Aria · Receptionist", short: "Receptionist", color: "bg-saffron", wash: "bg-saffron-wash", text: "text-saffron-deep", role: "Greets and routes" },
  order: { label: "Order agent", short: "Order", color: "bg-chili", wash: "bg-chili-wash", text: "text-chili", role: "Takes orders, upsells" },
  reservation: { label: "Reservation agent", short: "Reservation", color: "bg-cardamom", wash: "bg-cardamom-wash", text: "text-cardamom", role: "Books tables" },
  faq: { label: "FAQ agent", short: "FAQ", color: "bg-indigo", wash: "bg-indigo-wash", text: "text-indigo", role: "Answers questions" },
};

export const OUTCOME_LABEL: Record<string, string> = {
  order_placed: "Order placed",
  reservation_booked: "Table booked",
  reservation_changed: "Booking changed",
  question_answered: "Question answered",
  transferred: "Transferred",
  abandoned: "Hung up",
  in_progress: "In progress",
};
