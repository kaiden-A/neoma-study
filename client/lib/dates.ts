// Date helpers ported from the prototype's util.js. Everything is local time
// (Monday-first weeks, local start-of-day) and every timestamp in the API is
// an integer in milliseconds.

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const MS = { minute: MINUTE, hour: HOUR, day: DAY };

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type Timestamp = number;

export function startOfDay(value: Timestamp | Date): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value: Timestamp | Date): Date {
  const date = new Date(value instanceof Date ? value.getTime() : value);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function dayKey(value: Timestamp | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isSameDay(a: Timestamp | Date, b: Timestamp | Date): boolean {
  const first = a instanceof Date ? a : new Date(a);
  const second = b instanceof Date ? b : new Date(b);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

/** Calendar-day difference in local time (not a 24h window). */
export function daysUntil(target: Timestamp | Date, from: Timestamp | Date = Date.now()): number {
  const a = startOfDay(target).getTime();
  const b = startOfDay(from).getTime();
  return Math.round((a - b) / DAY);
}

export function hoursUntil(target: Timestamp | Date, from: Timestamp | Date = Date.now()): number {
  const a = target instanceof Date ? target.getTime() : target;
  const b = from instanceof Date ? from.getTime() : from;
  return Math.round((a - b) / HOUR);
}

export function addDays(value: Timestamp | Date, days: number): Date {
  const date = new Date(value instanceof Date ? value.getTime() : value);
  date.setDate(date.getDate() + days);
  return date;
}

export function addMinutes(value: Timestamp | Date, minutes: number): Date {
  const date = new Date(value instanceof Date ? value.getTime() : value);
  date.setMinutes(date.getMinutes() + minutes);
  return date;
}

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const dayLongFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const monthYearFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

function asDate(value: Timestamp | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function fmtTime(value: Timestamp | Date): string {
  return timeFormat.format(asDate(value));
}

export function fmtDay(value: Timestamp | Date): string {
  return dayFormat.format(asDate(value));
}

export function fmtDayLong(value: Timestamp | Date): string {
  return dayLongFormat.format(asDate(value));
}

export function fmtMonthYear(value: Timestamp | Date): string {
  return monthYearFormat.format(asDate(value));
}

export function fmtDateTime(value: Timestamp | Date): string {
  return `${fmtDay(value)} · ${fmtTime(value)}`;
}

export function fmtRelative(value: Timestamp | Date, from: Timestamp | Date = Date.now()): string {
  const target = asDate(value).getTime();
  const base = asDate(from).getTime();
  const diff = target - base;
  const minutes = Math.round(diff / MINUTE);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60) return minutes < 0 ? `${-minutes}m ago` : `in ${minutes}m`;
  const hours = Math.round(diff / HOUR);
  if (Math.abs(hours) < 24) return hours < 0 ? `${-hours}h ago` : `in ${hours}h`;
  const days = Math.round(diff / DAY);
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (Math.abs(days) < 30) return days < 0 ? `${-days}d ago` : `in ${days}d`;
  return fmtDay(value);
}

export function dayLabel(value: Timestamp | Date): string {
  const days = daysUntil(value);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return fmtDay(value);
}

/** Local `YYYY-MM-DDTHH:mm` for datetime-local inputs. */
export function toInputValue(value: Timestamp | Date | null): string {
  if (value === null) return "";
  const date = asDate(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

/** Local parse of a datetime-local value; null when empty. */
export function fromInputValue(value: string): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0).getTime();
}

/** Monday-first six-week grid (42 cells) covering the anchor's month. */
export function monthGrid(anchor: Timestamp | Date): Date[] {
  const date = asDate(anchor);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

/** Monday-first seven days of the anchor's week. */
export function weekDays(anchor: Timestamp | Date): Date[] {
  const date = asDate(anchor);
  const start = startOfDay(date);
  const offset = (start.getDay() + 6) % 7;
  const monday = addDays(start, -offset);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export type DialTone = "done" | "danger" | "today" | "soon" | "muted";

export interface DialPhase {
  f: number;
  tone: DialTone;
  label: string;
}

/** The moon-phase deadline dial: illumination maps time-to-deadline. */
export function moonPhase(dueAt: Timestamp, done: boolean, from: Timestamp = Date.now()): DialPhase {
  if (done) return { f: 1, tone: "done", label: "done" };
  const hours = hoursUntil(dueAt, from);
  if (hours < 0) {
    const overdueDays = Math.max(1, Math.ceil(-hours / 24));
    return { f: 1, tone: "danger", label: `overdue ${overdueDays}d` };
  }
  const days = daysUntil(dueAt, from);
  if (hours <= 24) return { f: 0.92, tone: "today", label: "today" };
  if (days <= 3) return { f: 0.75, tone: "soon", label: `in ${days}d` };
  if (days <= 7) return { f: 0.55, tone: "muted", label: `in ${days}d` };
  if (days <= 14) return { f: 0.35, tone: "muted", label: `in ${days}d` };
  return { f: 0.18, tone: "muted", label: `in ${days}d` };
}

export function truncate(value: string, max: number): string {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function plain(value: string): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slug(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return String(url ?? "")
      .replace(/^https?:\/\//, "")
      .split("/")[0];
  }
}

export function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
