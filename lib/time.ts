/** Time helpers that work in the restaurant's own timezone, wherever the server runs. */

export interface LocalParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  weekday: number; // 0 = Sunday
  minutes: number; // minutes since midnight
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function localParts(timezone: string, at: Date = new Date()): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const time = `${hour}:${parts.minute}`;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time,
    weekday: WEEKDAYS.indexOf(parts.weekday),
    minutes: toMinutes(time),
  };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "19:30" -> "7:30 PM" */
export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** "2026-11-13" -> "Friday, Nov 13" */
export function prettyDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Converts a restaurant-local date + time into a real Date (UTC instant).
 * Works by measuring the zone offset at that moment.
 */
export function zonedToDate(date: string, time: string, timezone: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const local = localParts(timezone, guess);
  const diffMinutes =
    (Date.parse(`${local.date}T${local.time}:00Z`) - guess.getTime()) / 60000;
  return new Date(guess.getTime() - diffMinutes * 60000);
}
