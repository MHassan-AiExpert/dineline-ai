import { addDays, localParts, weekdayOf } from "./time";

const DAY_WORDS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Resolves "today", "tomorrow", "friday", "next saturday", "nov 14", "14/11", "2026-11-14"
 * to YYYY-MM-DD in the restaurant's timezone. Returns null when nothing date-like is found.
 */
export function resolveDate(input: string, timezone: string, now = new Date()): string | null {
  const s = input.toLowerCase().trim();
  const today = localParts(timezone, now).date;
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  if (/\btonight\b|\btoday\b|\bthis evening\b/.test(s)) return today;
  if (/\bday after tomorrow\b/.test(s)) return addDays(today, 2);
  if (/\btomorrow\b|\btmrw\b|\btmr\b/.test(s)) return addDays(today, 1);

  for (let i = 0; i < 7; i++) {
    const re = new RegExp(`\\b(${DAY_WORDS[i]}|${DAY_SHORT[i]})\\b`);
    if (re.test(s)) {
      const current = weekdayOf(today);
      let diff = (i - current + 7) % 7;
      if (/\bnext\b/.test(s) && diff === 0) diff = 7;
      else if (/\bnext week\b/.test(s)) diff += 7;
      return addDays(today, diff);
    }
  }

  // "nov 14", "14 nov", "november 14th"
  const monthDay = s.match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/) || null;
  const dayMonth = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3})[a-z]*\b/) || null;
  let month = -1;
  let day = -1;
  if (monthDay && MONTHS.includes(monthDay[1])) {
    month = MONTHS.indexOf(monthDay[1]);
    day = Number(monthDay[2]);
  } else if (dayMonth && MONTHS.includes(dayMonth[2])) {
    month = MONTHS.indexOf(dayMonth[2]);
    day = Number(dayMonth[1]);
  } else {
    // "11/14" (US month/day)
    const slash = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (slash) {
      month = Number(slash[1]) - 1;
      day = Number(slash[2]);
    }
  }
  if (month >= 0 && day >= 1 && day <= 31) {
    let year = Number(today.slice(0, 4));
    let candidate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (candidate < today) {
      year += 1;
      candidate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    return candidate;
  }
  return null;
}

/**
 * Resolves "8pm", "8:30 pm", "20:00", "7.30", "half past seven", "noon" to HH:MM (24h).
 * Bare numbers 1-10 are assumed to be PM (dinner bookings), 11 AM, 12 noon.
 */
export function resolveTime(input: string): string | null {
  const s = input.toLowerCase().trim();
  if (/\bnoon\b|\bmidday\b/.test(s)) return "12:00";
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  const half = s.match(/\bhalf past (\w+)\b/);
  if (half) {
    const h = words[half[1]] ?? Number(half[1]);
    if (h) return to24(h, 30, s);
  }
  // Score every number-like candidate: am/pm or hh:mm beats a bare number after "at"/"around".
  let best: { h: number; min: number; sfx: string; score: number } | null = null;
  for (const m of s.matchAll(/(^|[^\d:])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|o'?clock)?(?![\d])/g)) {
    const before = s.slice(0, (m.index ?? 0) + m[1].length);
    const after = s.slice((m.index ?? 0) + m[0].length);
    const h = Number(m[2]);
    const min = m[3] ? Number(m[3]) : 0;
    if (h > 23 || min > 59) continue;
    if (/\b(for|of|party of|table for|group of)\s*$/.test(before) && !m[4] && !m[3]) continue; // "for 4" = guests
    if (/^\s*(people|persons|guests|of us|adults|pax|ppl|kids|children)\b/.test(after)) continue;
    if (/^\s*(st|nd|rd|th)\b/.test(after) || /\/\s*$/.test(before)) continue; // dates
    let score = 0;
    if (m[4]) score += 3;
    if (m[3]) score += 2;
    if (/\b(at|around|about|by|for)\s*$/.test(before)) score += 1;
    if (/^\d{1,2}([:.]\d{2})?\s*(am|pm)?$/.test(s)) score += 1;
    if (score === 0) continue;
    if (!best || score > best.score) best = { h, min, sfx: (m[4] ?? "").replace(/o'?clock/, ""), score };
  }
  if (best) return to24(best.h, best.min, best.sfx);
  const mWord = s.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+(thirty|fifteen|forty five))?\s*(am|pm|o'?clock)?\b/);
  if (mWord && (mWord[3] || /\b(at|around|for)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.test(s))) {
    const h = words[mWord[1]];
    const min = mWord[2] === "thirty" ? 30 : mWord[2] === "fifteen" ? 15 : mWord[2] === "forty five" ? 45 : 0;
    return to24(h, min, mWord[3] ?? "");
  }
  return null;
}

function to24(h: number, min: number, suffix: string): string {
  let hour = h;
  const sfx = suffix.replace(/\./g, "");
  if (sfx === "pm" && hour < 12) hour += 12;
  else if (sfx === "am" && hour === 12) hour = 0;
  else if (!sfx.startsWith("a") && !sfx.startsWith("p") && hour >= 1 && hour <= 10) hour += 12; // assume evening
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Extracts a party size from "for 4", "party of six", "4 people", "table for two". */
export function resolvePartySize(input: string): number | null {
  const s = input.toLowerCase();
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2 };
  const m =
    s.match(/\b(?:for|party of|table for|group of)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?!\s*(?::|am|pm|o'?clock|\.\d))/) ||
    s.match(/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:people|persons|guests|of us|adults|pax|ppl)\b/);
  if (m) return words[m[1]] ?? Number(m[1]);
  if (/\bjust me\b|\bmyself\b/.test(s)) return 1;
  if (/\b(me and my (wife|husband|partner|girlfriend|boyfriend)|the two of us|a couple)\b/.test(s)) return 2;
  return null;
}

export function resolvePhone(input: string): string | null {
  const m = input.replace(/[^\d+]/g, " ").match(/\+?\d[\d\s]{8,14}\d/);
  if (!m) return null;
  const d = m[0].replace(/\s/g, "");
  if (d.replace(/\D/g, "").length < 10) return null;
  if (d.startsWith("+")) return d;
  const digits = d.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

export function resolveZip(input: string): string | null {
  const m = input.match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}
