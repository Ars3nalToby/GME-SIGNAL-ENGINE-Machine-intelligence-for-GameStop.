import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { newerFilingAvailable, parseCapital, possibleShares } from "@/lib/capital";

const run = (data: unknown) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cap-")), "c.json");
  fs.writeFileSync(f, JSON.stringify(data));
  try {
    return { code: 0, out: execFileSync("node", ["scripts/verify-capital.mjs", f], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    const x = e as { status: number; stderr: string };
    return { code: x.status, out: x.stderr };
  }
};

describe("verify:capital", () => {
  it("the shipped (empty) file passes", () => {
    expect(execFileSync("node", ["scripts/verify-capital.mjs"], { encoding: "utf8" })).toContain("OK");
  });
  it("fails when a non-null field has no source", () => {
    const r = run({ verifiedAt: "2026-10-01", instruments: [{ name: "Synthetic Notes", principal: 1000, verifiedAt: "2026-10-01", sources: [] }] });
    expect(r.code).toBe(1);
    expect(r.out).toContain('field "principal"');
    expect(r.out).toContain('field "name"');
  });
  it("passes when every non-null field is sourced", () => {
    const src = (field: string) => ({ field, label: "Synthetic 8-K", url: "https://www.sec.gov/Archives/edgar/data/0/0/x.htm", accession: "0000000000-26-000001", section: "Item 1.01" });
    const r = run({ verifiedAt: "2026-10-01", instruments: [{ name: "Synthetic Notes", principal: 1000, verifiedAt: "2026-10-01", sources: [src("name"), src("principal")] }] });
    expect(r.code).toBe(0);
  });
  it("rejects non-sec.gov source URLs", () => {
    const r = run({ verifiedAt: "x", instruments: [{ name: "N", verifiedAt: "x", sources: [{ field: "name", label: "blog", url: "https://example.com/x", accession: "a" }] }] });
    expect(r.code).toBe(1);
  });
});

describe("capital helpers", () => {
  it("possible shares needs both verified inputs; stale banner compares dates", () => {
    const c = parseCapital({ instruments: [{ outstanding: 1_000_000, conversionRate: 20 }, { outstanding: 5 }] });
    expect(possibleShares(c.instruments[0]!)).toBe(20_000);
    expect(possibleShares(c.instruments[1]!)).toBeNull();
    expect(newerFilingAvailable("2026-06-01T00:00:00Z", "2026-07-01T00:00:00Z")).toBe(true);
    expect(newerFilingAvailable("2026-08-01T00:00:00Z", "2026-07-01T00:00:00Z")).toBe(false);
    expect(newerFilingAvailable(null, "2026-07-01T00:00:00Z")).toBe(false);
  });
  it("the shipped data file parses and contains no instruments (nothing unverified shipped)", async () => {
    const raw = JSON.parse(fs.readFileSync("data/capital-structure.json", "utf8"));
    const c = parseCapital(raw);
    expect(c.instruments).toEqual([]);
    expect(c.verifiedAt).toBeNull();
  });
});
