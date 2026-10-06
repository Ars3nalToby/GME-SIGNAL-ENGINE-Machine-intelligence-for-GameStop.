import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cache } from "@/lib/cache";
import { classifyXError, loadX, normalizeXPost, resetXState, xPostsUrl, xWatchList } from "@/lib/sources/x";
import { getEnv } from "@/lib/config/env";
import { fixture, jsonRes, stubFetch, text } from "./helpers";

const NOW_MS = Date.parse("2026-10-05T12:00:00Z");
const NOW = new Date(NOW_MS).toISOString();
const posts = JSON.parse(fixture("x-posts.json")) as { data: { id: string; text: string; created_at?: string; referenced_tweets?: { type: string; id: string }[] }[] };

beforeEach(() => {
  cache.clear();
  resetXState();
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllGlobals());

describe("X normalizer", () => {
  it("original RC post → HIGH, item URL and initials", () => {
    const it = normalizeXPost(posts.data[0]!, "ryancohen", NOW)!;
    expect(it).toMatchObject({ id: "x:900000000000000001", sourceType: "x", handle: "ryancohen", url: "https://x.com/ryancohen/status/900000000000000001", credibility: "insider_direct", source: "X · @ryancohen" });
    expect(it.signal).toBe("high");
    expect(it.score).toBe(86);
    expect(it.people).toEqual(["ryan_cohen"]);
  });
  it("replies and reposts are tagged; reply scores lower", () => {
    const reply = normalizeXPost(posts.data[1]!, "ryancohen", NOW)!;
    expect(reply.tags).toContain("Reply");
    expect(reply.score).toBe(78);
    expect(normalizeXPost(posts.data[2]!, "gamestop", NOW)!.tags).toContain("Repost");
  });
  it("posts without a timestamp are dropped, not guessed", () => {
    expect(normalizeXPost(posts.data[3]!, "gamestop", NOW)).toBeUndefined();
  });
  it("@larryvc / @gamestop base scores", () => {
    expect(normalizeXPost(posts.data[0]!, "larryvc", NOW)!.score).toBe(66);
    expect(normalizeXPost(posts.data[0]!, "gamestop", NOW)!.score).toBe(52);
  });
});

describe("X request shape & cost controls", () => {
  it("max_results=5; excludes reposts by default, replies included by default", () => {
    const url = xPostsUrl("1001", getEnv({}));
    expect(url).toContain("max_results=5");
    expect(url).toContain("tweet.fields=created_at,referenced_tweets,entities");
    expect(url).toContain("exclude=retweets");
    expect(url).not.toContain("replies");
    expect(xPostsUrl("1", getEnv({ X_INCLUDE_REPLIES: "false", X_INCLUDE_REPOSTS: "true" }))).toContain("exclude=replies");
  });
  it("watch list defaults to ryancohen, larryvc, gamestop with profile links", () => {
    expect(xWatchList(getEnv({})).map((w) => [w.handle, w.initials, w.profileUrl])).toEqual([
      ["ryancohen", "RC", "https://x.com/ryancohen"], ["larryvc", "LC", "https://x.com/larryvc"], ["gamestop", "GS", "https://x.com/gamestop"],
    ]);
  });
});

describe("X error classification", () => {
  it("401/403 → token rejected; 402/credits → exhausted; 429 → rate limited until reset", () => {
    expect(classifyXError(401, "{}", null, NOW_MS)).toMatchObject({ kind: "auth", message: "token rejected (HTTP 401)" });
    expect(classifyXError(403, "{}", null, NOW_MS).kind).toBe("auth");
    expect(classifyXError(402, JSON.stringify({ title: "CreditsDepleted" }), null, NOW_MS)).toMatchObject({ kind: "credits", message: "X credits exhausted (HTTP 402)" });
    const rl = classifyXError(429, "{}", String(NOW_MS / 1000 + 600), NOW_MS);
    expect(rl.kind).toBe("rate");
    expect(rl.retryAtMs).toBe(NOW_MS + 600_000);
  });
});

describe("loadX integration (stubbed HTTP)", () => {
  it("no token → status setup, no network calls, no items", async () => {
    const calls = stubFetch([]);
    const r = await loadX({ nowMs: NOW_MS });
    expect(r.health.status).toBe("setup");
    expect(r.health.lastError).toBe("X API NOT CONNECTED");
    expect(r.items).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("with a token: resolves ids once, fetches each handle, never sends the token anywhere but the Authorization header", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "test-token");
    const seen: { url: string; auth?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.authorization });
      if (url.includes("/users/by")) return jsonRes(JSON.parse(fixture("x-users.json")));
      if (/\/users\/\d+\/tweets/.test(url)) return jsonRes(posts);
      return text("nf", 404);
    }));
    const r = await loadX({ nowMs: NOW_MS });
    expect(r.health.status).toBe("live");
    expect(r.items.length).toBe(9); // 3 handles × 3 dated posts
    expect(seen.every((s) => !s.url.includes("test-token"))).toBe(true);
    expect(seen.every((s) => s.auth === "Bearer test-token")).toBe(true);
    const before = seen.length;
    await loadX({ nowMs: NOW_MS }); // inside the poll TTL: no new API calls (cost control)
    expect(seen.length).toBe(before);
  });

  it("402 → 'X credits exhausted' with HTTP status; 401 → 'token rejected'", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "t");
    stubFetch([[/\/users\/by/, () => jsonRes({ title: "CreditsDepleted", detail: "no credits" }, 402)]]);
    expect((await loadX({ nowMs: NOW_MS })).health).toMatchObject({ status: "error", lastError: expect.stringContaining("credits exhausted (HTTP 402)") });
    cache.clear();
    stubFetch([[/\/users\/by/, () => jsonRes({}, 401)]]);
    expect((await loadX({ nowMs: NOW_MS })).health.lastError).toContain("token rejected (HTTP 401)");
  });

  it("429 on timelines honours x-rate-limit-reset and stops calling until then", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "t");
    vi.stubEnv("X_HANDLES", "gamestop");
    let timeline = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/users/by")) return jsonRes({ data: [{ id: "1003", username: "gamestop" }] });
      timeline++;
      return new Response("{}", { status: 429, headers: { "x-rate-limit-reset": String(NOW_MS / 1000 + 900) } });
    }));
    const a = await loadX({ nowMs: NOW_MS });
    expect(a.health.lastError).toContain("rate limited (HTTP 429)");
    cache.clear();
    await loadX({ nowMs: NOW_MS + 60_000 });
    expect(timeline).toBe(1);
  });
});
