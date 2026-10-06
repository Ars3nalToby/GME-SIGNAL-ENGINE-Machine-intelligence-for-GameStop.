import { describe, expect, it } from "vitest";
import { keywordBoost, scoreIr, scoreNews, scoreSec, scoreX, type Form4Summary } from "@/lib/scoring";

const f4 = (o: Partial<Form4Summary>): Form4Summary => ({
  parsed: true, owners: [], hasP: false, hasRcP: false, hasWarrantEx: false, hasRcWarrantEx: false,
  hasS: false, hasMX: false, routineOnly: false, codes: [], ...o,
});

describe("keyword traps", () => {
  it("'extended warranty' is not a warrant", () => {
    expect(keywordBoost("GameStop sells extended warranty plans").hits.has("warrants")).toBe(false);
    expect(keywordBoost("GameStop warrants expire this month").hits.has("warrants")).toBe(true);
  });
  it("'board games' / 'keyboard' are not board of directors", () => {
    expect(keywordBoost("GameStop board games and keyboard sale").hits.has("roles")).toBe(false);
    expect(keywordBoost("GameStop board of directors meets").hits.has("roles")).toBe(true);
  });
  it("'product offering' gets no Capital boost; 'stock offering' does", () => {
    expect(keywordBoost("GameStop new product offering").hits.has("capital")).toBe(false);
    expect(keywordBoost("GameStop announces stock offering").hits.has("capital")).toBe(true);
    expect(keywordBoost("GameStop announces convertible notes").hits.has("capital")).toBe(true);
  });
  it("'atmosphere' is not ATM; uppercase ATM is", () => {
    expect(keywordBoost("great atmosphere at GameStop stores").hits.has("capital")).toBe(false);
    expect(keywordBoost("GameStop ATM program").hits.has("capital")).toBe(true);
    expect(keywordBoost("GameStop atm program").hits.has("capital")).toBe(false);
  });
  it("BTC only uppercase; bitcoin any case", () => {
    expect(keywordBoost("btc is a word").hits.has("treasury")).toBe(false);
    expect(keywordBoost("holds BTC").hits.has("treasury")).toBe(true);
    expect(keywordBoost("Bitcoin holdings").hits.has("treasury")).toBe(true);
  });
  it("total keyword boost capped at +20", () => {
    const k = keywordBoost("acquisition convertible warrants Form 4 bitcoin earnings Ryan Cohen CEO");
    expect(k.boost).toBe(20);
  });
});

describe("SEC table", () => {
  it("RC Form 4 code P → HIGH 98", () => {
    const s = scoreSec({ form: "4", form4: f4({ owners: ["ryan_cohen"], hasP: true, hasRcP: true, codes: ["P"] }) });
    expect(s.score).toBe(98);
    expect(s.signal).toBe("high");
    expect(s.reasons[0]).toContain("code P");
  });
  it("RC warrant exercise 95; other RC 88; any P 92; S 82; unparsed 80; LC 78; M/X 72", () => {
    expect(scoreSec({ form: "4", form4: f4({ owners: ["ryan_cohen"], hasWarrantEx: true, hasRcWarrantEx: true, hasMX: true }) }).score).toBe(95);
    expect(scoreSec({ form: "4", form4: f4({ owners: ["ryan_cohen"], routineOnly: true }) }).score).toBe(88);
    expect(scoreSec({ form: "4", form4: f4({ hasP: true }) }).score).toBe(92);
    expect(scoreSec({ form: "4", form4: f4({ hasS: true }) }).score).toBe(82);
    expect(scoreSec({ form: "4" }).score).toBe(80);
    expect(scoreSec({ form: "4", form4: f4({ owners: ["larry_cheng"] }) }).score).toBe(78);
    expect(scoreSec({ form: "4", form4: f4({ hasMX: true }) }).score).toBe(72);
  });
  it("routine code-F Form 4 → 62", () => {
    const s = scoreSec({ form: "4", form4: f4({ routineOnly: true, codes: ["F"] }) });
    expect(s.score).toBe(62);
    expect(s.signal).toBe("medium");
  });
  it("8-K takes the max item", () => {
    expect(scoreSec({ form: "8-K", items8k: ["2.02", "9.01"] }).score).toBe(92);
    expect(scoreSec({ form: "8-K", items8k: ["1.01", "2.02"] }).score).toBe(95);
    expect(scoreSec({ form: "8-K", items8k: ["5.02"] }).score).toBe(88);
    expect(scoreSec({ form: "8-K", items8k: ["7.01", "9.01"] }).score).toBe(82);
    expect(scoreSec({ form: "8-K", items8k: ["5.03"] }).score).toBe(76);
  });
  it("13D family: 96 for Ryan Cohen filer or counterparty subject, else 92; 13G 62", () => {
    expect(scoreSec({ form: "SCHEDULE 13D/A", filerPerson: "ryan_cohen" }).score).toBe(96);
    expect(scoreSec({ form: "SC 13D", subjectIsCounterparty: true }).score).toBe(96);
    expect(scoreSec({ form: "SCHEDULE 13D" }).score).toBe(92);
    expect(scoreSec({ form: "SCHEDULE 13G/A" }).score).toBe(62);
  });
  it("other forms", () => {
    expect(scoreSec({ form: "425" }).score).toBe(95);
    expect(scoreSec({ form: "SC TO-T" }).score).toBe(95);
    expect(scoreSec({ form: "DFAN14A" }).score).toBe(90);
    expect(scoreSec({ form: "10-K" }).score).toBe(88);
    expect(scoreSec({ form: "10-Q/A" }).score).toBe(72);
    expect(scoreSec({ form: "S-3ASR" }).score).toBe(86);
    expect(scoreSec({ form: "424B5", text: "convertible notes offering" }).score).toBe(92);
    expect(scoreSec({ form: "424B5", text: "pricing supplement" }).score).toBe(86);
    expect(scoreSec({ form: "DEF 14A" }).score).toBe(78);
    expect(scoreSec({ form: "25-NSE" }).score).toBe(75);
    expect(scoreSec({ form: "144" }).score).toBe(70);
    expect(scoreSec({ form: "3" }).score).toBe(60);
    expect(scoreSec({ form: "S-8" }).score).toBe(58);
    expect(scoreSec({ form: "CORRESP" }).score).toBe(55);
    expect(scoreSec({ form: "ARS" }).score).toBe(50);
  });
});

describe("other sources", () => {
  it("RC original post → HIGH; reply and others capped", () => {
    const p = scoreX("ryancohen", false, "hello");
    expect(p.score).toBe(86);
    expect(p.signal).toBe("high");
    expect(scoreX("ryancohen", true, "hi").score).toBe(78);
    expect(scoreX("ryancohen", false, "acquire eBay convertible warrants Form 4").score).toBeLessThanOrEqual(99);
    expect(scoreX("larryvc", false, "x").score).toBe(66);
    expect(scoreX("gamestop", false, "x").score).toBe(52);
    expect(scoreX("gamestop", false, "acquire eBay convertible warrants Form 4 bitcoin").score).toBeLessThanOrEqual(80);
  });
  it("IR base 86 capped at 98", () => {
    expect(scoreIr("Quarterly update").score).toBe(86);
    expect(scoreIr("acquire eBay convertible warrants Form 4 earnings").score).toBe(98);
  });
  it("T3 eBay rumour ≤ 74 and is not HIGH", () => {
    const s = scoreNews("t3", "GameStop could acquire eBay, sources said — exclusive, Ryan Cohen CEO convertible warrants");
    expect(s.score).toBeLessThanOrEqual(74);
    expect(s.signal).not.toBe("high");
  });
  it("T1 exclusive on an acquisition → HIGH", () => {
    const s = scoreNews("t1", "Exclusive: GameStop plans to acquire eBay, people familiar say");
    expect(s.signal).toBe("high");
    expect(s.score).toBeGreaterThanOrEqual(85);
    expect(s.score).toBeLessThanOrEqual(88);
  });
  it("T2 exclusive M&A gets +15 but stays under its cap 80", () => {
    const s = scoreNews("t2", "Exclusive: GameStop plans to acquire eBay, sources said");
    expect(s.score).toBe(44 + 10 + 15);
  });
  it("clickbait penalty and opinion cap", () => {
    const clean = scoreNews("t3", "GameStop earnings beat");
    const bait = scoreNews("t3", "GameStop earnings: should you buy now?");
    expect(bait.score).toBe(clean.score - 12);
    expect(scoreNews("opinion", "GameStop acquire eBay convertible warrants Form 4 Ryan Cohen").score).toBeLessThanOrEqual(49);
  });
  it("scores are 0..99 ints and signal thresholds hold", () => {
    expect(scoreSec({ form: "8-K", items8k: ["1.01"] }).signal).toBe("high");
    expect(scoreSec({ form: "S-8" }).signal).toBe("low");
    expect(scoreNews("t1", "x").score).toBe(50);
  });
});
