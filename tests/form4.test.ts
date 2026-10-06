import { describe, expect, it } from "vitest";
import { fixture } from "./helpers";
import { classifyForm4, form4Title, parseOwnershipXml, summarizeForm4 } from "@/lib/sources/sec-form4";
import { scoreSec } from "@/lib/scoring";

const ctx = { accession: "0000000000-26-000001", filingUrl: "https://example.test/x" };

describe("Form 4 parser (synthetic fixtures)", () => {
  it("multi-row purchase by Ryan Cohen: rows, D/I labelling, exact aggregates only", () => {
    const p = parseOwnershipXml(fixture("form4-multirow.xml"), ctx);
    expect(p.status).toBe("ok");
    expect(p.issuer.cik).toBe("0001326380");
    expect(p.owners[0]).toMatchObject({ name: "Ryan Cohen", roles: ["Director", "Chief Executive Officer"] });
    expect(p.txns).toHaveLength(2);
    expect(p.txns[0]).toMatchObject({ code: "P", shares: 200000, pricePerShare: 20, value: 4_000_000, sharesOwnedAfter: 1_000_000, directIndirect: "D", parseStatus: "ok" });
    expect(p.txns[1]).toMatchObject({ shares: 300000, pricePerShare: 21.5, directIndirect: "I", natureOfOwnership: "By Synthetic Holdings LLC" });
    expect(classifyForm4(p)).toBe("purchase");
    expect(form4Title("4", p)).toBe("FORM 4 · Ryan Cohen · PURCHASE 500,000 sh @ avg $20.90");
    const s = summarizeForm4(p);
    expect(s.hasRcP).toBe(true);
    expect(scoreSec({ form: "4", form4: s }).score).toBe(98);
  });

  it("weighted-average price is flagged with its footnote; sale classified", () => {
    const p = parseOwnershipXml(fixture("form4-weighted-avg.xml"), ctx);
    const t = p.txns[0]!;
    expect(p.owners[0]!.name).toBe("Doe Jane");
    expect(t.code).toBe("S");
    expect(t.priceIsAverage).toBe(true);
    expect(t.priceNote).toMatch(/weighted average sale price/);
    expect(t.pricePerShare).toBeCloseTo(23.4567);
    expect(form4Title("4", p)).toContain("avg");
    expect(form4Title("4", p)).toContain("see footnote");
    expect(form4Title("4", p)).toContain("SALE 10,000 sh");
    expect(classifyForm4(p)).toBe("sale");
  });

  it("warrant exercise is its own class and never a purchase", () => {
    const p = parseOwnershipXml(fixture("form4-warrant-exercise.xml"), ctx);
    expect(p.txns).toHaveLength(2);
    const der = p.txns.find((t) => t.isDerivative)!;
    expect(der.isWarrant).toBe(true);
    expect(der.exercisePrice).toBe(32);
    expect(classifyForm4(p)).toBe("warrant_exercise");
    const title = form4Title("4", p);
    expect(title).toContain("WARRANT EXERCISE 100,000 warrants @ $32.00 strike");
    expect(title).not.toContain("PURCHASE");
    const s = summarizeForm4(p);
    expect(s.hasRcWarrantEx).toBe(true);
    expect(s.hasP).toBe(false);
    expect(scoreSec({ form: "4", form4: s }).score).toBe(95);
  });

  it("routine code F → routine title and score 62", () => {
    const p = parseOwnershipXml(fixture("form4-routine-f.xml"), ctx);
    expect(classifyForm4(p)).toBe("routine");
    expect(form4Title("4", p)).toBe("FORM 4 · Roe Richard · routine (grant / tax withholding)");
    expect(scoreSec({ form: "4", form4: summarizeForm4(p) }).score).toBe(62);
  });

  it("Form 3 holdings are parsed as holdings, not transactions", () => {
    const p = parseOwnershipXml(fixture("form3-holdings.xml"), ctx);
    expect(p.txns).toHaveLength(0);
    expect(p.holdings[0]).toMatchObject({ sharesOwned: 5000, directIndirect: "D" });
    expect(form4Title("3", p)).toBe("FORM 3 · Larry Cheng · initial ownership statement");
  });

  it("garbage / empty documents are 'failed' and titled unparsed — never guessed", () => {
    const p = parseOwnershipXml("<html>not xml we expect</html>", ctx);
    expect(p.status).toBe("failed");
    expect(classifyForm4(p)).toBe("unparsed");
    expect(form4Title("4", p, "Someone")).toBe("FORM 4 · Someone (unparsed — open filing)");
    expect(scoreSec({ form: "4", form4: summarizeForm4(p) }).score).toBe(80);
    expect(parseOwnershipXml("", ctx).status).toBe("failed");
  });

  it("non-numeric shares/price become null and the row partial", () => {
    const xml = fixture("form4-multirow.xml").replace("<value>200000</value>", "<value>about 200k</value>");
    const p = parseOwnershipXml(xml, ctx);
    expect(p.txns[0]!.shares).toBeNull();
    expect(p.txns[0]!.value).toBeNull();
    expect(p.txns[0]!.parseStatus).toBe("partial");
    expect(p.status).toBe("partial");
    expect(form4Title("4", p)).toContain("PURCHASE (shares unparsed)");
  });
});
