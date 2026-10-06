import "server-only";
/**
 * TTL cache with stale-on-error and in-flight coalescing (SPEC §5).
 * In-memory ⇒ per serverless instance; fetch-level data cache (lib/http.ts) adds cross-instance sharing.
 */
export type CacheResult<T> = {
  value: T;
  fetchedAt: number;
  /** true when a refresh failed and the previous good value is served */
  stale: boolean;
  error?: string;
  fromCache: boolean;
  latencyMs?: number;
};

type Entry<T> = { value: T; at: number; latencyMs?: number };
type Fail = { at: number; error: Error };

export const FORCE_MIN_AGE_MS = 30_000;
const ERROR_BACKOFF_MS = 10_000;

export class TtlCache {
  private store = new Map<string, Entry<unknown>>();
  private fails = new Map<string, Fail>();
  private inflight = new Map<string, Promise<CacheResult<unknown>>>();
  readonly attempts = new Map<string, number>();

  constructor(private now: () => number = () => Date.now()) {}

  peek<T>(key: string): Entry<T> | undefined {
    return this.store.get(key) as Entry<T> | undefined;
  }

  lastAttemptAt(key: string): number | undefined {
    return this.attempts.get(key);
  }

  clear() {
    this.store.clear();
    this.fails.clear();
    this.inflight.clear();
    this.attempts.clear();
  }

  async get<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    opts: { force?: boolean; minForceAgeMs?: number } = {},
  ): Promise<CacheResult<T>> {
    const entry = this.store.get(key) as Entry<T> | undefined;
    const t = this.now();
    const age = entry ? t - entry.at : Infinity;
    const forceOk = !!opts.force && !!entry && age >= (opts.minForceAgeMs ?? FORCE_MIN_AGE_MS);
    if (entry && age < ttlMs && !forceOk) {
      return { value: entry.value, fetchedAt: entry.at, stale: false, fromCache: true, latencyMs: entry.latencyMs };
    }
    const running = this.inflight.get(key);
    if (running) return running as Promise<CacheResult<T>>;

    const fail = this.fails.get(key);
    if (!entry && fail && t - fail.at < ERROR_BACKOFF_MS) throw fail.error;

    const p = (async (): Promise<CacheResult<T>> => {
      this.attempts.set(key, this.now());
      const started = this.now();
      try {
        const value = await loader();
        const latencyMs = this.now() - started;
        const at = this.now();
        this.store.set(key, { value, at, latencyMs });
        this.fails.delete(key);
        return { value, fetchedAt: at, stale: false, fromCache: false, latencyMs };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.fails.set(key, { at: this.now(), error });
        if (entry) {
          return { value: entry.value, fetchedAt: entry.at, stale: true, error: error.message, fromCache: true, latencyMs: entry.latencyMs };
        }
        throw error;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p as Promise<CacheResult<unknown>>);
    return p;
  }
}

/** Filings are immutable: cache by accession (+ doc kind) forever, bounded, failures negatively cached briefly. */
export class ImmutableCache<T> {
  private store = new Map<string, T>();
  private failures = new Map<string, { at: number; error: Error }>();
  private inflight = new Map<string, Promise<T>>();
  constructor(private max = 3000, private now: () => number = () => Date.now(), private failTtlMs = 60_000) {}

  has(key: string): boolean {
    return this.store.has(key);
  }
  peek(key: string): T | undefined {
    return this.store.get(key);
  }
  clear() {
    this.store.clear();
    this.failures.clear();
    this.inflight.clear();
  }
  get size() {
    return this.store.size;
  }

  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    if (this.store.has(key)) return this.store.get(key) as T;
    const run = this.inflight.get(key);
    if (run) return run;
    const f = this.failures.get(key);
    if (f && this.now() - f.at < this.failTtlMs) throw f.error;
    const p = (async () => {
      try {
        const v = await loader();
        if (this.store.size >= this.max) {
          const first = this.store.keys().next().value;
          if (first !== undefined) this.store.delete(first);
        }
        this.store.set(key, v);
        this.failures.delete(key);
        return v;
      } catch (e) {
        this.failures.set(key, { at: this.now(), error: e instanceof Error ? e : new Error(String(e)) });
        throw e;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }
}

declare global {
  var __gmeCache: TtlCache | undefined;
}
/** Process-wide singleton (survives Next dev HMR). */
export const cache: TtlCache = (globalThis.__gmeCache ??= new TtlCache());
