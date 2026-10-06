import { describe, expect, it } from "vitest";
import {
  filingDateToIso, fmtBrisbane, fmtExpiryBrisbane, fmtExpiryNY, fmtNY, inferAcceptanceZone, nyseSession, parseAcceptance, parseDeadline, parseIrDate, relAge, warrantCountdown, warrantExpiry,
} from "@/lib/time";

const T = (s: string) => Date.parse(s);

describe("warrant expiry & countdown (fixed 'now' values)", () => {
  it("expiry instant is 30 Oct 2026 17:00 New York = 21:00Z (EDT) — not a naive date parse", () => {
    expect(warrantExpiry().toUTC().toISO()).toBe("2026-10-30T21:00:00.000Z");
    expect(fmtExpiryNY()).toBe("30 OCT 5:00 PM ET");
    expect(fmtExpiryBrisbane()).toBe("SAT 31 OCT 7:00 AM BRISBANE");
  });
  it("days when ≥ 48h", () => {
    expect(warrantCountdown(T("2026-10-06T00:00:00Z")).label).toBe("24 DAYS TO WARRANT EXPIRY");
    expect(warrantCountdown(T("2026-10-28T20:59:00Z")).label).toBe("2 DAYS TO WARRANT EXPIRY");
  });
  it("h:m under 48h", () => {
    expect(warrantCountdown(T("2026-10-29T10:00:00Z")).label).toBe("35h 00m TO WARRANT EXPIRY");
    expect(warrantCountdown(T("2026-10-30T20:15:00Z")).label).toBe("0h 45m TO WARRANT EXPIRY");
  });
  it("EXPIRED at and after the instant", () => {
    expect(warrantCountdown(T("2026-10-30T21:00:00Z")).label).toBe("EXPIRED");
    expect(warrantCountdown(T("2026-11-02T00:00:00Z")).expired).toBe(true);
  });
  it("is independent of the viewer's timezone (same instant from Brisbane and New York 'now')", () => {
    const nowBrisbane = new Date("2026-10-06T10:00:00+10:00").getTime();
    const nowNy = new Date("2026-10-05T20:00:00-04:00").getTime();
    expect(nowBrisbane).toBe(nowNy);
    expect(warrantCountdown(nowBrisbane).label).toBe(warrantCountdown(nowNy).label);
  });
});

describe("NYSE session", () => {
  it("pre-market / open / after-hours / closed", () => {
    expect(nyseSession(T("2026-10-06T08:00:00Z")).label).toBe("Pre-market"); // 04:00 ET
    expect(nyseSession(T("2026-10-06T13:29:00Z")).label).toBe("Pre-market");
    expect(nyseSession(T("2026-10-06T13:30:00Z")).label).toBe("Open");
    expect(nyseSession(T("2026-10-06T20:00:00Z")).label).toBe("After-hours"); // 16:00 ET
    expect(nyseSession(T("2026-10-07T00:00:00Z")).label).toBe("Closed"); // 20:00 ET
    expect(nyseSession(T("2026-10-06T07:59:00Z")).label).toBe("Closed"); // 03:59 ET
  });
  it("weekends and configured holidays", () => {
    expect(nyseSession(T("2026-10-10T15:00:00Z"))).toMatchObject({ label: "Closed", detail: "weekend" });
    expect(nyseSession(T("2026-11-26T15:00:00Z")).label).toBe("Closed");
    expect(nyseSession(T("2026-11-26T15:00:00Z"), []).label).toBe("Open"); // not listed ⇒ not known
  });
});

describe("SEC timestamps", () => {
  it("infers the zone from EDGAR's 06:00–22:00 ET window", () => {
    expect(inferAcceptanceZone(["2026-10-05T07:30:00.000Z", "2026-10-05T15:00:00.000Z"])).toBe("America/New_York");
    expect(inferAcceptanceZone(["2026-10-05T23:30:00.000Z", "2026-10-05T02:00:00.000Z"])).toBe("UTC");
    expect(inferAcceptanceZone(["2026-10-05T15:00:00.000Z"])).toBeUndefined();
    expect(inferAcceptanceZone(["2026-10-05T07:30:00.000Z", "2026-10-05T23:30:00.000Z"])).toBeUndefined(); // contradictory
  });
  it("normalizes under each reading", () => {
    expect(parseAcceptance("2026-10-05T16:30:12.000Z", "UTC")!.toUTC().toISO()).toBe("2026-10-05T16:30:12.000Z");
    expect(parseAcceptance("2026-10-05T16:30:12.000Z", "America/New_York")!.toUTC().toISO()).toBe("2026-10-05T20:30:12.000Z");
    expect(parseAcceptance("garbage", "UTC")).toBeNull();
  });
  it("filingDate-only falls back to noon Eastern", () => {
    expect(filingDateToIso("2026-10-05")).toBe("2026-10-05T16:00:00.000Z");
  });
});

describe("formatting", () => {
  it("Brisbane and New York strings", () => {
    expect(fmtBrisbane("2026-10-05T16:30:12.000Z")).toBe("06 Oct 02:30 AEST");
    expect(fmtNY("2026-10-05T16:30:12.000Z")).toBe("05 Oct 12:30 EDT");
  });
  it("relative age", () => {
    const now = T("2026-10-06T00:00:00Z");
    expect(relAge("2026-10-05T23:42:00Z", now)).toBe("18m ago");
    expect(relAge("2026-10-05T23:59:30Z", now)).toBe("30s ago");
    expect(relAge("2026-10-05T10:00:00Z", now)).toBe("14h ago");
    expect(relAge("2026-10-01T00:00:00Z", now)).toBe("5d ago");
  });
  it("IR dates are Eastern", () => {
    expect(parseIrDate("10/07/2025 16:05:00")).toBe("2025-10-07T20:05:00.000Z");
    expect(parseIrDate("May 3, 2026")).toBe("2026-05-03T04:00:00.000Z");
    expect(parseIrDate("nonsense")).toBeNull();
  });
  it("broker deadlines default to Brisbane time", () => {
    expect(parseDeadline("2026-10-27T17:00")!.toUTC().toISO()).toBe("2026-10-27T07:00:00.000Z");
    expect(parseDeadline(null)).toBeNull();
    expect(parseDeadline("not a date")).toBeNull();
  });
});
