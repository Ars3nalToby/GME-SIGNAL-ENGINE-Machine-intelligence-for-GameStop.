"use client";
import { useCallback, useSyncExternalStore } from "react";

// localStorage-backed state on top of useSyncExternalStore: the server snapshot is always the default,
// so SSR and the hydration pass agree; the stored value appears right after hydration.
// Every storage access is wrapped in try/catch with an in-memory fallback (private mode, quota, blocked storage).

const memory = new Map<string, string>();
const parsed = new Map<string, { raw: string | null; value: unknown }>();
const listeners = new Map<string, Set<() => void>>();

function rawGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}
function rawSet(key: string, raw: string) {
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    /* kept in memory for this session only */
  }
}

export function readStore<T>(key: string, fallback: T): T {
  const raw = rawGet(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
export function writeStore(key: string, value: unknown) {
  rawSet(key, JSON.stringify(value));
  parsed.delete(key);
  listeners.get(key)?.forEach((f) => f());
}

function snapshot<T>(key: string, initial: T): T {
  const raw = rawGet(key);
  const hit = parsed.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = initial;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = initial;
    }
  }
  parsed.set(key, { raw, value });
  return value;
}

export function usePersisted<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) {
          parsed.delete(key);
          cb();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        set.delete(cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(subscribe, () => snapshot(key, initial), () => initial);
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      const prev = snapshot(key, initial);
      writeStore(key, typeof v === "function" ? (v as (p: T) => T)(prev) : v);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return [value, set];
}

let baseline: number | null | undefined;
/** Value of a stored timestamp as it was when this page load started (stable for the whole session). */
export function useBaseline(key: string): number | null {
  return useSyncExternalStore(
    () => () => undefined,
    () => (baseline === undefined ? (baseline = readStore<number | null>(key, null)) : baseline),
    () => null,
  );
}
