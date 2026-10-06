import { DateTime, Duration } from "luxon";
import { BRISBANE_ZONE, NY_ZONE, NYSE_HOLIDAYS, WARRANT_TERMS } from "./config/watch";

export function iso(dt: DateTime): string {
  return dt.toUTC().toISO({ suppressMilliseconds: false }) ?? "";
}

export function parseIso(s: string): DateTime {
  return DateTime.fromISO(s, { setZone: true });
}

/** "06 Oct 10:42 AEST" — deterministic for server and client (explicit zone + locale). */
export function fmtBrisbane(isoStr: string, withYear = false): string {
  const d = DateTime.fromISO(isoStr, { zone: BRISBANE_ZONE, locale: "en-AU" });
  if (!d.isValid) return "—";
  return `${d.toFormat(withYear ? "dd LLL yyyy HH:mm" : "dd LLL HH:mm")} AEST`;
}

export function fmtNY(isoStr: string): string {
  const d = DateTime.fromISO(isoStr, { zone: NY_ZONE, locale: "en-US" });
  if (!d.isValid) return "—";
  return `${d.toFormat("dd LLL HH:mm")} ${d.offsetNameShort ?? "ET"}`;
}

export function fmtHm(isoStr: string, zone: string): string {
  const d = DateTime.fromISO(isoStr, { zone, locale: "en-US" });
  return d.isValid ? d.toFormat("HH:mm") : "—";
}

export function fmtClock(now: number, zone: string): string {
  return DateTime.fromMillis(now, { zone, locale: "en-US" }).toFormat("HH:mm:ss");
}

/** Relative age like "18m ago". Pure: caller supplies `nowMs` (client-side after mount). */
export function relAge(isoStr: string, nowMs: number): string {
  const t = Date.parse(isoStr);
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function shortAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

/** Brisbane day bucket label for timeline grouping. */
export function dayBucket(isoStr: string, nowMs: number): string {
  const d = DateTime.fromISO(isoStr, { zone: BRISBANE_ZONE });
  const today = DateTime.fromMillis(nowMs, { zone: BRISBANE_ZONE }).startOf("day");
  const diff = Math.round(today.diff(d.startOf("day"), "days").days);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.setLocale("en-AU").toFormat("cccc dd LLL yyyy");
}

// ---------- SEC acceptance timestamps ----------

export type AcceptanceZone = "UTC" | "America/New_York";

/** Parse an EDGAR acceptanceDateTime ("2026-10-05T16:30:12.000Z") under the given reading of its wall clock. */
export function parseAcceptance(raw: string, zone: AcceptanceZone): DateTime | null {
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  if (!m) return null;
  const d = DateTime.fromISO(`${m[1]}T${m[2]}`, { zone });
  return d.isValid ? d : null;
}

/**
 * EDGAR only accepts filings 06:00–22:00 Eastern. Compare the two hypotheses on a sample of raw
 * timestamps: hours 04–10 are only plausible if the stamp is Eastern wall-clock; hours 22–04 only if UTC.
 * Returns undefined when the sample cannot discriminate.
 */
export function inferAcceptanceZone(rawStamps: string[]): AcceptanceZone | undefined {
  let eastern = 0;
  let utc = 0;
  for (const raw of rawStamps) {
    const m = raw.match(/T(\d{2}):/);
    if (!m) continue;
    const h = Number(m[1]);
    if (h >= 6 && h < 10) eastern++;
    else if (h >= 22 || h < 4) utc++;
  }
  if (eastern > 0 && utc === 0) return "America/New_York";
  if (utc > 0 && eastern === 0) return "UTC";
  return undefined;
}

/** SEC filingDate only (no time): treat as noon Eastern so it sorts inside its own day. */
export function filingDateToIso(filingDate: string): string | null {
  const d = DateTime.fromISO(`${filingDate}T12:00:00`, { zone: NY_ZONE });
  return d.isValid ? iso(d) : null;
}

/** like parseIrDate, but says whether the source carried a time of day */
export function parseIrDateEx(raw: string): { iso: string; dateOnly: boolean } | null {
  const iso = parseIrDate(raw);
  return iso ? { iso, dateOnly: !/\d{1,2}:\d{2}/.test(raw) } : null;
}

/** "03 May 2026" in New York time (date-only values are US dates; converting them to Brisbane could shift the day) */
export function fmtDateOnly(isoStr: string): string {
  const d = DateTime.fromISO(isoStr, { zone: NY_ZONE, locale: "en-US" });
  return d.isValid ? `${d.toFormat("dd LLL yyyy")} (date only)` : "—";
}

/** Q4 IR dates look like "10/07/2025 16:05:00" or "2025-10-07T16:05:00", Eastern time. */
export function parseIrDate(raw: string): string | null {
  const s = raw.trim();
  let d = DateTime.fromFormat(s, "MM/dd/yyyy HH:mm:ss", { zone: NY_ZONE });
  if (!d.isValid) d = DateTime.fromFormat(s, "M/d/yyyy h:mm:ss a", { zone: NY_ZONE, locale: "en-US" });
  if (!d.isValid) d = DateTime.fromFormat(s, "MM/dd/yyyy", { zone: NY_ZONE });
  if (!d.isValid) d = DateTime.fromISO(s, { zone: NY_ZONE });
  if (!d.isValid) d = DateTime.fromFormat(s, "LLLL d, yyyy", { zone: NY_ZONE, locale: "en-US" });
  if (!d.isValid) d = DateTime.fromFormat(s, "LLL d, yyyy", { zone: NY_ZONE, locale: "en-US" });
  return d.isValid ? iso(d) : null;
}

// ---------- NYSE session ----------

export type NyseSession = { label: "Pre-market" | "Open" | "After-hours" | "Closed"; detail: string; /** false once the date is past the last year in the holiday list */ calendarKnown: boolean };

export function nyseSession(nowMs: number, holidays: string[] = NYSE_HOLIDAYS): NyseSession {
  const ny = DateTime.fromMillis(nowMs, { zone: NY_ZONE });
  const date = ny.toISODate() ?? "";
  const lastYear = holidays.reduce((m, h) => Math.max(m, Number(h.slice(0, 4))), 0);
  const calendarKnown = lastYear > 0 && ny.year <= lastYear;
  if (ny.weekday >= 6) return { label: "Closed", detail: "weekend", calendarKnown };
  if (holidays.includes(date)) return { label: "Closed", detail: "market holiday (per config)", calendarKnown };
  const mins = ny.hour * 60 + ny.minute;
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return { label: "Pre-market", detail: "04:00–09:30 ET", calendarKnown };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { label: "Open", detail: "09:30–16:00 ET", calendarKnown };
  if (mins >= 16 * 60 && mins < 20 * 60) return { label: "After-hours", detail: "16:00–20:00 ET", calendarKnown };
  return { label: "Closed", detail: "outside extended hours", calendarKnown };
}

// ---------- Warrant expiry ----------

export function warrantExpiry(): DateTime {
  return DateTime.fromISO(WARRANT_TERMS.expiryLocal, { zone: WARRANT_TERMS.expiryZone });
}

export type Countdown = { expired: boolean; label: string; totalMs: number };

export function warrantCountdown(nowMs: number, expiry: DateTime = warrantExpiry()): Countdown {
  const diff = expiry.toMillis() - nowMs;
  if (diff <= 0) return { expired: true, label: "EXPIRED", totalMs: 0 };
  const dur = Duration.fromMillis(diff).shiftTo("days", "hours", "minutes");
  const hours = diff / 3_600_000;
  if (hours >= 48) {
    const days = Math.floor(diff / 86_400_000);
    return { expired: false, label: `${days} DAYS TO WARRANT EXPIRY`, totalMs: diff };
  }
  const totalH = Math.floor(hours);
  const mins = Math.floor(dur.minutes);
  return { expired: false, label: `${totalH}h ${String(mins).padStart(2, "0")}m TO WARRANT EXPIRY`, totalMs: diff };
}

export function fmtExpiryNY(expiry: DateTime = warrantExpiry()): string {
  return `${expiry.setZone(NY_ZONE).setLocale("en-US").toFormat("dd LLL h:mm a").toUpperCase()} ET`;
}

export function fmtExpiryBrisbane(expiry: DateTime = warrantExpiry()): string {
  return `${expiry.setZone(BRISBANE_ZONE).setLocale("en-AU").toFormat("ccc dd LLL h:mm a").toUpperCase()} BRISBANE`;
}

/** Broker cut-off strings: ISO local; no offset ⇒ Brisbane time. */
export function parseDeadline(raw: string | null | undefined): DateTime | null {
  if (!raw) return null;
  const d = DateTime.fromISO(raw, { zone: BRISBANE_ZONE, setZone: false });
  return d.isValid ? d : null;
}
