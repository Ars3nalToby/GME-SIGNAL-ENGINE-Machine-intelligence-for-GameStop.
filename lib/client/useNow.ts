"use client";
import { useSyncExternalStore } from "react";

// Shared 1 s ticker. The server (and the hydration pass) see 0, so nothing time-dependent
// renders until after mount — this keeps SSR markup and the first client render identical.
let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const subs = new Set<() => void>();

function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      subs.forEach((f) => f());
    }, 1000);
  }
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** epoch ms, or 0 until the component has mounted on the client */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now, () => 0);
}
