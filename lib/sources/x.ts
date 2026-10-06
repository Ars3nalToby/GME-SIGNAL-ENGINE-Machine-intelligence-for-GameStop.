import "server-only";
/**
 * X (Twitter) API v2 — optional, credential-gated, paid per post returned (SPEC §7.6).
 * Cost control: max_results=5, per-handle server TTL (X_POLL_SECONDS), user IDs cached 7 days,
 * 429 honours x-rate-limit-reset, nothing is fetched without a token. No placeholder posts, ever.
 */
import { z } from "zod";
import { cache } from "../cache";
import { X_ACCOUNT_META } from "../config/watch";
import { getEnv, type Env } from "../config/env";
import { getResponse, SetupError } from "../http";
import { makeHealth } from "../health";
import { peopleIn } from "../people";
import { scoreX } from "../scoring";
import type { SourceResult, WireItem } from "../types";

const API = "https://api.x.com/2";
const USERS_TTL = 7 * 24 * 3600_000;

const UsersSchema = z.object({ data: z.array(z.object({ id: z.string(), username: z.string(), name: z.string().optional() })).optional(), errors: z.array(z.unknown()).optional() });
const PostSchema = z.object({
  id: z.string(),
  text: z.string(),
  created_at: z.string().optional(),
  referenced_tweets: z.array(z.object({ type: z.string(), id: z.string() })).optional(),
});
const PostsSchema = z.object({ data: z.array(PostSchema).optional(), meta: z.object({ result_count: z.number().optional() }).passthrough().optional() });
export type XPost = z.infer<typeof PostSchema>;

export class XError extends Error {
  constructor(message: string, public status: number, public kind: "auth" | "credits" | "rate" | "http" | "shape", public retryAtMs?: number) {
    super(message);
    this.name = "XError";
  }
}

export function classifyXError(status: number, bodyText: string, resetHeader: string | null, nowMs: number): XError {
  let title = "";
  try {
    const j = JSON.parse(bodyText) as { title?: string; detail?: string; type?: string };
    title = `${j.title ?? ""} ${j.detail ?? ""} ${j.type ?? ""}`;
  } catch {
    title = bodyText.slice(0, 200);
  }
  if (status === 402 || /credit/i.test(title)) return new XError(`X credits exhausted (HTTP ${status})`, status, "credits");
  if (status === 401 || status === 403) return new XError(`token rejected (HTTP ${status})`, status, "auth");
  if (status === 429) {
    const reset = resetHeader ? Number(resetHeader) * 1000 : NaN;
    const retryAtMs = Number.isFinite(reset) && reset > nowMs ? reset : nowMs + 15 * 60_000;
    return new XError(`rate limited (HTTP 429) — retry after ${new Date(retryAtMs).toISOString().slice(11, 19)}Z`, 429, "rate", retryAtMs);
  }
  return new XError(`HTTP ${status}`, status, "http");
}

export function normalizeXPost(p: XPost, handle: string, nowIso: string): WireItem | undefined {
  if (!p.created_at || Number.isNaN(Date.parse(p.created_at))) return undefined;
  const h = handle.toLowerCase();
  const isReply = !!p.referenced_tweets?.some((r) => r.type === "replied_to");
  const isRepost = !!p.referenced_tweets?.some((r) => r.type === "retweeted");
  const sc = scoreX(h, isReply, p.text);
  const meta = X_ACCOUNT_META[h];
  return {
    id: `x:${p.id}`,
    sourceType: "x",
    source: `X · @${h}`,
    credibility: "insider_direct",
    title: p.text.replace(/\s+/g, " ").trim(),
    publishedAt: new Date(p.created_at).toISOString(),
    fetchedAt: nowIso,
    url: `https://x.com/${h}/status/${p.id}`,
    handle: h,
    author: meta?.label ?? `@${h}`,
    people: [...new Set([...(h === "ryancohen" ? (["ryan_cohen"] as const) : h === "larryvc" ? (["larry_cheng"] as const) : []), ...peopleIn(p.text)])],
    tags: ["X", ...(isReply ? ["Reply"] : []), ...(isRepost ? ["Repost"] : []), `@${h}`],
    score: sc.score,
    signal: sc.signal,
    scoreReasons: sc.reasons,
  };
}

const blockedUntil = new Map<string, number>();
/** tests only */
export function resetXState() {
  blockedUntil.clear();
}

async function xGet<T>(url: string, token: string, schema: z.ZodType<T>, nowMs: number): Promise<T> {
  const res = await getResponse(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw classifyXError(res.status, body, res.headers.get("x-rate-limit-reset"), nowMs);
  }
  const parsed = schema.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) throw new XError("unexpected X API response shape", 200, "shape");
  return parsed.data;
}

async function resolveIds(env: Env, token: string, nowMs: number, force: boolean): Promise<Map<string, string>> {
  const r = await cache.get(
    `x:users:${env.xHandles.join(",")}`,
    USERS_TTL,
    async () => {
      const data = await xGet(`${API}/users/by?usernames=${encodeURIComponent(env.xHandles.join(","))}`, token, UsersSchema, nowMs);
      return Object.fromEntries((data.data ?? []).map((u) => [u.username.toLowerCase(), u.id]));
    },
    { force, minForceAgeMs: 24 * 3600_000 },
  );
  return new Map(Object.entries(r.value));
}

export type XWatchEntry = { handle: string; label: string; initials: string; profileUrl: string };

export function xWatchList(env: Env): XWatchEntry[] {
  return env.xHandles.map((h) => ({ handle: h, label: X_ACCOUNT_META[h]?.label ?? `@${h}`, initials: X_ACCOUNT_META[h]?.initials ?? h.slice(0, 2).toUpperCase(), profileUrl: `https://x.com/${h}` }));
}

export function xPostsUrl(id: string, env: Env): string {
  const exclude = [!env.xIncludeReplies && "replies", !env.xIncludeReposts && "retweets"].filter(Boolean).join(",");
  return `${API}/users/${id}/tweets?max_results=5&tweet.fields=created_at,referenced_tweets,entities${exclude ? `&exclude=${exclude}` : ""}`;
}

export async function loadX(opts: { force?: boolean; nowMs?: number } = {}): Promise<SourceResult> {
  const env = getEnv();
  const nowMs = opts.nowMs ?? Date.now();
  if (!env.xToken) return { items: [], health: makeHealth({ id: "x", label: "X API", itemCount: 0, nowMs, error: new SetupError("X API NOT CONNECTED"), note: "set X_BEARER_TOKEN to enable (paid, pay-per-use)" }) };
  const token = env.xToken;
  const nowIso = new Date(nowMs).toISOString();
  try {
    const ids = await resolveIds(env, token, nowMs, !!opts.force);
    const results = await Promise.allSettled(
      env.xHandles.map(async (h) => {
        const id = ids.get(h);
        if (!id) throw new XError(`@${h} not found by X API`, 404, "http");
        if ((blockedUntil.get(h) ?? 0) > nowMs) throw new XError(`rate limited — waiting for x-rate-limit-reset`, 429, "rate", blockedUntil.get(h));
        return cache.get(
          `x:posts:${h}`,
          env.xPollSeconds * 1000,
          async () => {
            try {
              const data = await xGet(xPostsUrl(id, env), token, PostsSchema, nowMs);
              return (data.data ?? []).map((p) => normalizeXPost(p, h, nowIso)).filter((x): x is WireItem => !!x);
            } catch (e) {
              if (e instanceof XError && e.kind === "rate" && e.retryAtMs) blockedUntil.set(h, e.retryAtMs);
              throw e;
            }
          },
          { force: opts.force, minForceAgeMs: env.xPollSeconds * 1000 }, // force can never beat the poll interval: X bills per post
        );
      }),
    );
    const items: WireItem[] = [];
    const errors: string[] = [];
    let stale = false;
    let fetchedAt = 0;
    let latency = 0;
    results.forEach((r, i) => {
      const h = env.xHandles[i]!;
      if (r.status === "fulfilled") {
        items.push(...r.value.value);
        if (r.value.stale) {
          stale = true;
          errors.push(`@${h}: ${r.value.error}`);
        }
        fetchedAt = Math.max(fetchedAt, r.value.fetchedAt);
        latency = Math.max(latency, r.value.latencyMs ?? 0);
      } else errors.push(`@${h}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    });
    if (results.every((r) => r.status === "rejected")) {
      const first = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
      throw first.reason;
    }
    return {
      items,
      health: makeHealth({
        id: "x", label: "X API", itemCount: items.length, nowMs,
        result: { fetchedAt: fetchedAt || nowMs, stale: stale || errors.length > 0, error: errors.join("; ") || undefined, latencyMs: latency },
        attemptedAt: nowMs,
        note: `${env.xHandles.length} handles · max 5 posts each · poll ${env.xPollSeconds}s`,
      }),
    };
  } catch (e) {
    return { items: [], health: makeHealth({ id: "x", label: "X API", itemCount: 0, nowMs, error: e, attemptedAt: nowMs }) };
  }
}
