"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SourceHealth, WireItem } from "@/lib/types";
import type { XWatchEntry } from "@/lib/sources/x";

export const POLL_MS = 60_000;

export type FeedState = {
  items: WireItem[];
  sources: SourceHealth[];
  xWatch: XWatchEntry[];
  xConnected: boolean;
  generatedAt?: string;
  loading: boolean;
  /** /api/feed itself failed (network / 5xx) */
  failed: boolean;
  error?: string;
  loadedOnce: boolean;
  lastFetchAt?: number;
  refresh: () => void;
  /** ids of HIGH items that appeared since the previous successful poll (for aria-live) */
  newHighIds: string[];
  /** ids that arrived in the latest poll (never on the first load) */
  newIds: string[];
};

const Ctx = createContext<FeedState | null>(null);

export function useFeed(): FeedState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFeed outside FeedProvider");
  return c;
}

export function FeedProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<{ items: WireItem[]; sources: SourceHealth[]; xWatch: XWatchEntry[]; xConnected: boolean; generatedAt?: string }>({ items: [], sources: [], xWatch: [], xConnected: false });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [lastFetchAt, setLastFetchAt] = useState<number | undefined>();
  const [newHighIds, setNewHighIds] = useState<string[]>([]);
  const [newIds, setNewIds] = useState<string[]>([]);
  const seen = useRef<Set<string> | null>(null);
  const inflight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setLoading(true);
    try {
      // the button and the poll both call plain /api/feed: server TTLs are never bypassed from here
      const res = await fetch("/api/feed", { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`/api/feed HTTP ${res.status}`);
      const j = (await res.json()) as { items: WireItem[]; sources: SourceHealth[]; xWatch?: XWatchEntry[]; xConnected?: boolean; generatedAt: string };
      setData({ items: j.items, sources: j.sources, xWatch: j.xWatch ?? [], xConnected: !!j.xConnected, generatedAt: j.generatedAt });
      const highs = j.items.filter((i) => i.signal === "high").map((i) => i.id);
      if (seen.current) {
        setNewHighIds(highs.filter((id) => !seen.current!.has(id)));
        setNewIds(j.items.filter((i) => !seen.current!.has(i.id)).map((i) => i.id));
      }
      seen.current = new Set(j.items.map((i) => i.id));
      setFailed(false);
      setError(undefined);
      setLoadedOnce(true);
      setLastFetchAt(Date.now());
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setFailed(true);
      setError(e instanceof Error ? e.message : "feed request failed");
    } finally {
      if (inflight.current === ctrl) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (!timer) timer = setInterval(() => void refresh(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") stop();
      else {
        void refresh(); // refresh immediately when the tab becomes visible again
        start();
      }
    };
    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(first);
      stop();
      document.removeEventListener("visibilitychange", onVis);
      inflight.current?.abort();
    };
  }, [refresh]);

  const value = useMemo<FeedState>(
    () => ({ ...data, loading, failed, error, loadedOnce, lastFetchAt, refresh: () => void refresh(), newHighIds, newIds }),
    [data, loading, failed, error, loadedOnce, lastFetchAt, refresh, newHighIds, newIds],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
