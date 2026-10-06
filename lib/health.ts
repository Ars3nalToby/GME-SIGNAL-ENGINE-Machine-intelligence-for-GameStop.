import "server-only";
import type { CacheResult } from "./cache";
import { SetupError, shortError } from "./http";
import type { SourceHealth, SourceId } from "./types";

export type HealthInput = {
  id: SourceId;
  label: string;
  itemCount: number;
  nowMs: number;
  /** a cache result when the loader (or a stale copy) produced data */
  result?: Pick<CacheResult<unknown>, "fetchedAt" | "stale" | "error" | "latencyMs">;
  /** an error when nothing usable exists */
  error?: unknown;
  attemptedAt?: number;
  note?: string;
};

const iso = (ms: number) => new Date(ms).toISOString();

/** SPEC §5: live / degraded (stale-on-error) / setup (missing credentials) / error. */
export function makeHealth(i: HealthInput): SourceHealth {
  const base: SourceHealth = { id: i.id, label: i.label, status: "live", itemCount: i.itemCount, note: i.note };
  if (i.attemptedAt) base.lastAttemptAt = iso(i.attemptedAt);
  if (i.error !== undefined && !i.result) {
    if (i.error instanceof SetupError) return { ...base, status: "setup", lastError: i.error.message, itemCount: 0 };
    return { ...base, status: "error", lastError: shortError(i.error), itemCount: 0 };
  }
  const r = i.result;
  if (!r) return { ...base, status: "error", lastError: "no data", itemCount: 0 };
  base.lastSuccessAt = iso(r.fetchedAt);
  base.latencyMs = r.latencyMs;
  if (r.stale) {
    return { ...base, status: "degraded", lastError: r.error, note: i.note };
  }
  return base;
}
