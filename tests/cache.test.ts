import { describe, expect, it } from "vitest";
import { ImmutableCache, TtlCache } from "@/lib/cache";

const clock = () => {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe("TtlCache", () => {
  it("serves fresh values from cache and reloads after TTL", async () => {
    const c = clock();
    const cache = new TtlCache(c.now);
    let n = 0;
    const load = async () => ++n;
    expect((await cache.get("k", 60_000, load)).value).toBe(1);
    c.advance(30_000);
    const hit = await cache.get("k", 60_000, load);
    expect(hit.value).toBe(1);
    expect(hit.fromCache).toBe(true);
    c.advance(31_000);
    expect((await cache.get("k", 60_000, load)).value).toBe(2);
  });

  it("stale-on-error: serves the previous good value, marked stale with the error", async () => {
    const c = clock();
    const cache = new TtlCache(c.now);
    await cache.get("k", 10_000, async () => "good");
    c.advance(20_000);
    const r = await cache.get("k", 10_000, async () => {
      throw new Error("HTTP 503");
    });
    expect(r.value).toBe("good");
    expect(r.stale).toBe(true);
    expect(r.error).toBe("HTTP 503");
    expect(r.fetchedAt).toBe(1_000_000);
  });

  it("throws when there is nothing to fall back to, and backs off briefly before retrying", async () => {
    const c = clock();
    const cache = new TtlCache(c.now);
    let calls = 0;
    const bad = async () => {
      calls++;
      throw new Error("boom");
    };
    await expect(cache.get("k", 10_000, bad)).rejects.toThrow("boom");
    await expect(cache.get("k", 10_000, bad)).rejects.toThrow("boom");
    expect(calls).toBe(1); // second call served the remembered failure (no hammering)
    c.advance(11_000);
    await expect(cache.get("k", 10_000, bad)).rejects.toThrow("boom");
    expect(calls).toBe(2);
  });

  it("coalesces concurrent in-flight requests", async () => {
    const cache = new TtlCache();
    let calls = 0;
    const slow = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return calls;
    };
    const [a, b, d] = await Promise.all([cache.get("k", 1000, slow), cache.get("k", 1000, slow), cache.get("k", 1000, slow)]);
    expect(calls).toBe(1);
    expect([a.value, b.value, d.value]).toEqual([1, 1, 1]);
  });

  it("force only bypasses entries older than 30s", async () => {
    const c = clock();
    const cache = new TtlCache(c.now);
    let n = 0;
    const load = async () => ++n;
    await cache.get("k", 600_000, load);
    c.advance(10_000);
    expect((await cache.get("k", 600_000, load, { force: true })).value).toBe(1); // too young: ignored
    c.advance(25_000);
    expect((await cache.get("k", 600_000, load, { force: true })).value).toBe(2); // 35s old: allowed
  });
});

describe("ImmutableCache", () => {
  it("caches forever, coalesces, bounds its size, and negative-caches failures briefly", async () => {
    let t = 0;
    const ic = new ImmutableCache<number>(2, () => t, 1000);
    let calls = 0;
    const v = await Promise.all([ic.getOrLoad("a", async () => ++calls), ic.getOrLoad("a", async () => ++calls)]);
    expect(v).toEqual([1, 1]);
    await ic.getOrLoad("b", async () => 2);
    await ic.getOrLoad("c", async () => 3);
    expect(ic.has("a")).toBe(false); // evicted (max 2)
    let fails = 0;
    const bad = async () => {
      fails++;
      throw new Error("x");
    };
    await expect(ic.getOrLoad("z", bad)).rejects.toThrow();
    await expect(ic.getOrLoad("z", bad)).rejects.toThrow();
    expect(fails).toBe(1);
    t += 1500;
    await expect(ic.getOrLoad("z", bad)).rejects.toThrow();
    expect(fails).toBe(2);
  });
});
