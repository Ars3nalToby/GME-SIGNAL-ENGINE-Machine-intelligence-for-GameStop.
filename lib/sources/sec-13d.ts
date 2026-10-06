import "server-only";
/**
 * Schedule 13D/13G XML parser (SPEC §7.3).
 * The element names below are searched by key pattern rather than fixed path: the reference fixtures
 * could not be fetched from the build sandbox. Whatever cannot be found stays null ⇒ status "partial"/"failed".
 */
import { asArray, findAll, findFirstText, makeParser, strictNum, txt } from "../xml";
import { prettyName } from "../people";

export type ReportingPerson = {
  name: string;
  aggregateShares: number | null;
  percentOfClass: number | null;
  soleVoting: number | null;
  sharedVoting: number | null;
  soleDispositive: number | null;
  sharedDispositive: number | null;
  type?: string;
};

export type Sched13Parse = {
  status: "ok" | "partial" | "failed";
  error?: string;
  submissionType?: string;
  issuerName?: string;
  issuerCik?: string;
  securityClass?: string;
  dateOfEvent?: string;
  persons: ReportingPerson[];
  /** CIK(s) found in the filer credentials block */
  filerCiks: string[];
};

const key = (re: RegExp) => (k: string) => re.test(k);

export function parseSchedule13Xml(xml: string): Sched13Parse {
  const empty: Sched13Parse = { status: "failed", persons: [], filerCiks: [] };
  let root: unknown;
  try {
    root = makeParser(["reportingPersonInfo", "reportingPerson", "filer"]).parse(xml);
  } catch (e) {
    return { ...empty, error: `XML parse error: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!root || typeof root !== "object") return { ...empty, error: "empty document" };

  const submissionType = findFirstText(root, key(/^submissionType$/i));
  const issuerName = findFirstText(root, key(/^issuerName$/i));
  const issuerCik = findFirstText(root, key(/^issuerCIK$/i));
  const securityClass = findFirstText(root, key(/^securitiesClassTitle$/i));
  const dateOfEvent = findFirstText(root, key(/^dateOfEvent$/i));

  const containers = findAll(root, key(/^reportingPerson(Info)?$/i)).flatMap((c) => asArray(c as unknown[])).filter((c) => c && typeof c === "object");
  const persons: ReportingPerson[] = containers.map((c) => {
    const o = c as Record<string, unknown>;
    const get = (re: RegExp) => findFirstText(o, key(re));
    const name = get(/^reportingPersonName$/i) ?? get(/^(name|personName)$/i) ?? "";
    return {
      name: name ? prettyName(name) : "",
      aggregateShares: strictNum(get(/aggregate(Amount|Number)?(Beneficially)?Owned|aggregateAmount/i)),
      percentOfClass: strictNum(get(/^(percentOfClass|classPercent|percentClass)$/i)),
      soleVoting: strictNum(get(/^soleVotingPower$/i)),
      sharedVoting: strictNum(get(/^sharedVotingPower$/i)),
      soleDispositive: strictNum(get(/^soleDispositivePower$/i)),
      sharedDispositive: strictNum(get(/^sharedDispositivePower$/i)),
      type: get(/^typeOfReportingPerson$/i),
    };
  }).filter((p) => p.name || p.aggregateShares !== null);

  const filerCiks = findAll(root, key(/^filer$/i))
    .flatMap((f) => asArray(f as unknown[]))
    .map((f) => findFirstText(f, key(/^cik$/i)))
    .filter((x): x is string => !!x);

  const complete = !!issuerName && persons.length > 0 && persons.every((p) => p.name && p.aggregateShares !== null && p.percentOfClass !== null);
  const status: Sched13Parse["status"] = complete ? "ok" : issuerName || persons.length ? "partial" : "failed";
  return { status, submissionType, issuerName, issuerCik, securityClass, dateOfEvent, persons, filerCiks };
}

/** "GameStop Corp."-style display for titles. */
export function filerSummary(p: Sched13Parse): string | undefined {
  const names = p.persons.map((x) => x.name).filter(Boolean);
  if (names.length === 0) return undefined;
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}

export { txt };
