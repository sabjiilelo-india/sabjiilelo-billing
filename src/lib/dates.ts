// Business-day boundaries are computed in the shop's configured time zone.

function tzOffsetMs(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** UTC instant of 00:00 on the given calendar day in tz. */
export function startOfDayUtc(y: number, m: number, d: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return new Date(t);
}

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

export function todayInTz(tz: string, now = new Date()): Ymd {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now); // YYYY-MM-DD
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

function addDays({ y, m, d }: Ymd, n: number): Ymd {
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function parseYmd(s: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const v = { y: +m[1], m: +m[2], d: +m[3] };
  const dt = new Date(Date.UTC(v.y, v.m - 1, v.d));
  if (dt.getUTCMonth() + 1 !== v.m || dt.getUTCDate() !== v.d) return null;
  return v;
}

export type RangePreset =
  | "today" | "yesterday" | "last7" | "last30" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";

export interface Range {
  gte: Date;
  lt: Date;
}

export class DateRangeError extends Error {}

/** Returns [gte, lt) in UTC for a preset or custom (from/to inclusive, YYYY-MM-DD). */
export function resolveRange(
  preset: RangePreset | undefined,
  from: string | undefined,
  to: string | undefined,
  tz: string,
  now = new Date(),
): Range | null {
  const today = todayInTz(tz, now);
  const sod = (v: Ymd) => startOfDayUtc(v.y, v.m, v.d, tz);
  const tomorrow = addDays(today, 1);
  const dow = (new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = addDays(today, -dow);
  switch (preset) {
    case "today":
      return { gte: sod(today), lt: sod(tomorrow) };
    case "yesterday":
      return { gte: sod(addDays(today, -1)), lt: sod(today) };
    case "last7":
      return { gte: sod(addDays(today, -6)), lt: sod(tomorrow) };
    case "last30":
      return { gte: sod(addDays(today, -29)), lt: sod(tomorrow) };
    case "thisWeek":
      return { gte: sod(weekStart), lt: sod(addDays(weekStart, 7)) };
    case "lastWeek":
      return { gte: sod(addDays(weekStart, -7)), lt: sod(weekStart) };
    case "thisMonth": {
      const next = today.m === 12 ? { y: today.y + 1, m: 1, d: 1 } : { y: today.y, m: today.m + 1, d: 1 };
      return { gte: sod({ ...today, d: 1 }), lt: sod(next) };
    }
    case "lastMonth": {
      const prev = today.m === 1 ? { y: today.y - 1, m: 12, d: 1 } : { y: today.y, m: today.m - 1, d: 1 };
      return { gte: sod(prev), lt: sod({ ...today, d: 1 }) };
    }
    case "custom": {
      const f = from ? parseYmd(from) : null;
      const t = to ? parseYmd(to) : null;
      if ((from && !f) || (to && !t)) throw new DateRangeError("Invalid date");
      if (f && t && sod(f) > sod(t)) throw new DateRangeError("Start date must not be after end date");
      if (!f && !t) return null;
      return {
        gte: f ? sod(f) : new Date(0),
        lt: t ? sod(addDays(t, 1)) : new Date(8.64e15),
      };
    }
    default:
      return null;
  }
}

export function ymdString(v: Ymd): string {
  return `${v.y}-${String(v.m).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`;
}
