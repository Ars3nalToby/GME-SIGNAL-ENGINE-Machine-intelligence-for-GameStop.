import { describe, expect, it } from "vitest";
import { fixture } from "./helpers";
import { filerSummary, parseSchedule13Xml } from "@/lib/sources/sec-13d";
import { directionFromHeader, parseSecHeader } from "@/lib/sources/sec-header";

describe("13D parser (synthetic fixtures; element names inferred)", () => {
  it("person filing about GameStop", () => {
    const p = parseSchedule13Xml(fixture("sched13d-synthetic.xml"));
    expect(p.status).toBe("ok");
    expect(p.submissionType).toBe("SCHEDULE 13D/A");
    expect(p.issuerName).toBe("GameStop Corp.");
    expect(p.issuerCik).toBe("0001326380");
    expect(p.dateOfEvent).toBe("09/30/2026");
    expect(p.persons).toHaveLength(1);
    expect(p.persons[0]).toMatchObject({ name: "Ryan Cohen", aggregateShares: 1_300_000, percentOfClass: 0.3, soleVoting: 1_300_000 });
    expect(filerSummary(p)).toBe("Ryan Cohen");
  });
  it("company filing about another issuer", () => {
    const p = parseSchedule13Xml(fixture("sched13d-company-filer.xml"));
    expect(p.issuerName).toBe("EBAY INC");
    expect(p.persons[0]!.name).toBe("Gamestop Corp.");
    expect(p.persons[0]!.percentOfClass).toBe(1.1);
  });
  it("garbage ⇒ failed, missing percent ⇒ partial", () => {
    expect(parseSchedule13Xml("<x/>").status).toBe("failed");
    const partial = fixture("sched13d-synthetic.xml").replace("<percentOfClass>0.3</percentOfClass>", "");
    const p = parseSchedule13Xml(partial);
    expect(p.status).toBe("partial");
    expect(p.persons[0]!.percentOfClass).toBeNull();
  });
});

describe("SGML header", () => {
  it("separates SUBJECT COMPANY from FILED BY", () => {
    const h = parseSecHeader(fixture("sec-header-13d.txt"));
    expect(h.formType).toBe("SCHEDULE 13D/A");
    const d = directionFromHeader(h);
    expect(d.subject).toMatchObject({ name: "EBAY INC", cik: "0001065088" });
    expect(d.filer).toMatchObject({ name: "GAMESTOP CORP.", cik: "0001326380" });
  });
});
