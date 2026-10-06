import { describe, expect, it } from "vitest";
import { makeHealth } from "@/lib/health";
import { overallStatus, staleLabel } from "@/lib/health-view";
import { SetupError } from "@/lib/http";
import { HttpError } from "@/lib/http";

const NOW = Date.parse("2026-10-06T00:10:00Z");

describe("makeHealth", () => {
  it("live", () => {
    const h = makeHealth({ id: "sec", label: "SEC", itemCount: 5, nowMs: NOW, result: { fetchedAt: NOW - 1000, stale: false, latencyMs: 120 } });
    expect(h).toMatchObject({ status: "live", itemCount: 5, latencyMs: 120 });
  });
  it("degraded = stale-on-error, keeps last success and the error", () => {
    const h = makeHealth({ id: "ir", label: "IR", itemCount: 3, nowMs: NOW, result: { fetchedAt: NOW - 7 * 60_000, stale: true, error: "HTTP 503" } });
    expect(h.status).toBe("degraded");
    expect(h.lastError).toBe("HTTP 503");
    expect(staleLabel(h, NOW)).toBe("STALE 7m");
  });
  it("setup for missing credentials", () => {
    const h = makeHealth({ id: "x", label: "X", itemCount: 0, nowMs: NOW, error: new SetupError("X API NOT CONNECTED") });
    expect(h).toMatchObject({ status: "setup", lastError: "X API NOT CONNECTED" });
  });
  it("error includes the HTTP status", () => {
    const h = makeHealth({ id: "news", label: "News", itemCount: 0, nowMs: NOW, error: new HttpError(503, "https://x") });
    expect(h.status).toBe("error");
    expect(h.lastError).toContain("503");
  });
});

describe("overallStatus (header pill)", () => {
  const mk = (id: "sec" | "ir" | "news" | "x" | "market", status: "live" | "degraded" | "setup" | "error") => ({ id, label: id, status, itemCount: 0 });
  it("green only when all four core sources are live; market never counts", () => {
    expect(overallStatus([mk("sec", "live"), mk("ir", "live"), mk("news", "live"), mk("x", "live"), mk("market", "setup")], false)).toBe("live");
    expect(overallStatus([mk("sec", "live"), mk("ir", "degraded"), mk("news", "live"), mk("x", "live")], false)).toBe("degraded");
    expect(overallStatus([mk("sec", "live"), mk("ir", "live"), mk("news", "live"), mk("x", "setup")], false)).toBe("degraded");
  });
  it("red if the feed itself failed", () => {
    expect(overallStatus([], true)).toBe("error");
  });
});
