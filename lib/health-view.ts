import type { SourceHealth } from "./types";

/** Client-safe helpers for rendering source health (no server imports). */
export function staleLabel(h: SourceHealth, nowMs: number): string {
  if (!h.lastSuccessAt) return "";
  const m = Math.max(0, Math.floor((nowMs - Date.parse(h.lastSuccessAt)) / 60_000));
  return `STALE ${m}m`;
}

export function overallStatus(sources: SourceHealth[], feedFailed: boolean): "live" | "degraded" | "error" {
  if (feedFailed) return "error";
  // the optional market module is reported in the sidebar only; it never drives the header pill
  return sources.filter((s) => s.id !== "market").every((s) => s.status === "live") ? "live" : "degraded";
}
