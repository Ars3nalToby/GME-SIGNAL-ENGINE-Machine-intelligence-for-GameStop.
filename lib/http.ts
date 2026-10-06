import "server-only";
import { getEnv } from "./config/env";

export class HttpError extends Error {
  constructor(public status: number, public url: string, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "HttpError";
  }
}
/** Raised when a credential/config is missing: the source reports status "setup", not "error". */
export class SetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

export const REQUEST_TIMEOUT_MS = 8000;

export type ReqOpts = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Next.js fetch data-cache seconds (shared across serverless instances). Omit/0 ⇒ no-store. */
  revalidate?: number;
  signal?: AbortSignal;
};

async function doFetch(url: string, o: ReqOpts): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const init: RequestInit & { next?: { revalidate: number } } = {
      headers: o.headers,
      signal: ctrl.signal,
      redirect: "follow",
    };
    if (o.revalidate && o.revalidate > 0) init.next = { revalidate: o.revalidate };
    else init.cache = "no-store";
    return await fetch(url, init);
  } catch (e) {
    if (ctrl.signal.aborted) throw new HttpError(0, url, `timeout after ${(o.timeoutMs ?? REQUEST_TIMEOUT_MS) / 1000}s`);
    throw new HttpError(0, url, `network error: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function getText(url: string, o: ReqOpts = {}): Promise<string> {
  const res = await doFetch(url, o);
  if (!res.ok) throw new HttpError(res.status, url);
  return res.text();
}

export async function getJson<T = unknown>(url: string, o: ReqOpts = {}): Promise<T> {
  const text = await getText(url, { ...o, headers: { accept: "application/json", ...o.headers } });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(200, url, "response was not valid JSON");
  }
}

/** Raw response access (X needs headers). */
export async function getResponse(url: string, o: ReqOpts = {}): Promise<Response> {
  return doFetch(url, o);
}

// ---------------- SEC client ----------------

export const SEC_MIN_INTERVAL_MS = 200; // ≤ 5 req/s (SEC fair-access ceiling is 10)
let interval = SEC_MIN_INTERVAL_MS;
let nextSlot = 0;
/** tests only */
export function setSecIntervalForTests(ms: number) {
  interval = ms;
}

/** Global limiter: reserves the next 200 ms slot and waits for it. */
export async function secSlot(now: () => number = Date.now, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const t = now();
  const slot = Math.max(t, nextSlot);
  nextSlot = slot + interval;
  if (slot > t) await sleep(slot - t);
}
export function resetSecLimiter() {
  nextSlot = 0;
}

function secHeaders(extra?: Record<string, string>): Record<string, string> {
  const ua = getEnv().secUserAgent;
  if (!ua) throw new SetupError("SEC_USER_AGENT not set");
  return { "user-agent": ua, "accept-encoding": "gzip, deflate", ...extra };
}

async function secRequest(url: string, o: ReqOpts, wantBody: "text" | "response"): Promise<string | Response> {
  const headers = secHeaders(o.headers);
  let lastErr: HttpError | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    await secSlot();
    try {
      const res = await doFetch(url, { ...o, headers });
      if (res.status === 403) {
        throw new HttpError(403, url, "HTTP 403 SEC refused the request (usually a missing/invalid SEC_USER_AGENT — it must identify you: name + email)");
      }
      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        lastErr = new HttpError(res.status, url);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      if (!res.ok) throw new HttpError(res.status, url);
      return wantBody === "text" ? await res.text() : res;
    } catch (e) {
      if (e instanceof HttpError && e.status === 403) throw e;
      if (e instanceof HttpError && attempt === 0 && (e.status === 0 || e.status >= 500)) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw e;
    }
  }
  throw lastErr ?? new HttpError(0, url, "SEC request failed");
}

export async function secText(url: string, o: ReqOpts = {}): Promise<string> {
  return (await secRequest(url, o, "text")) as string;
}

export async function secJson<T = unknown>(url: string, o: ReqOpts = {}): Promise<T> {
  const text = await secText(url, { ...o, headers: { accept: "application/json", ...o.headers } });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(200, url, "SEC response was not valid JSON");
  }
}

/** Read at most `maxBytes` of a (potentially huge) document, e.g. the SGML header of a filing .txt. */
export async function secHead(url: string, maxBytes = 16_384, o: ReqOpts = {}): Promise<string> {
  const res = (await secRequest(url, { ...o, headers: { range: `bytes=0-${maxBytes - 1}`, ...o.headers } }, "response")) as Response;
  if (!res.body) return (await res.text()).slice(0, maxBytes);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let out = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      out += dec.decode(value, { stream: true });
      if (bytes >= maxBytes || /<\/SEC-HEADER>/i.test(out)) break;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return out;
}

export function shortError(e: unknown): string {
  if (e instanceof HttpError) return e.status ? `HTTP ${e.status}${e.message && !/^HTTP \d+$/.test(e.message) ? ` — ${e.message.replace(/^HTTP \d+ ?/, "")}` : ""}` : e.message;
  if (e instanceof Error) return e.message.slice(0, 160);
  return String(e).slice(0, 160);
}
