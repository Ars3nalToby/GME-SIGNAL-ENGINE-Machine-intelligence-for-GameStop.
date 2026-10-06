import { z } from "zod";

const Source = z.object({ field: z.string(), label: z.string(), url: z.string(), accession: z.string(), section: z.string().optional() });
const Instrument = z.object({
  name: z.string().nullable().default(null),
  type: z.string().nullable().default(null),
  principal: z.number().nullable().default(null),
  coupon: z.union([z.string(), z.number()]).nullable().default(null),
  maturity: z.string().nullable().default(null),
  conversionRate: z.number().nullable().default(null), // shares per $1,000 principal
  conversionPrice: z.number().nullable().default(null),
  conversionConditions: z.string().nullable().default(null),
  cappedCall: z.string().nullable().default(null),
  repurchases: z.string().nullable().default(null),
  outstanding: z.number().nullable().default(null),
  outstandingAsOf: z.string().nullable().default(null),
  verifiedAt: z.string().nullable().default(null),
  sources: z.array(Source).default([]),
});
export type Instrument = z.infer<typeof Instrument>;

const Warrants = z.object({
  outstanding: z.number().nullable().default(null),
  exercisePrice: z.number().nullable().default(null),
  sharesPerWarrant: z.number().nullable().default(null),
  expiry: z.string().nullable().default(null),
  sources: z.array(Source).default([]),
});

const Capital = z.object({ verifiedAt: z.string().nullable().default(null), instruments: z.array(Instrument).default([]), warrants: Warrants.nullable().default(null) }).passthrough();
export type Capital = z.infer<typeof Capital>;

export function parseCapital(raw: unknown): Capital {
  return Capital.parse(raw);
}

/** shares = outstanding principal ÷ $1,000 × conversion rate; null unless both inputs are verified */
export function possibleShares(i: Instrument): number | null {
  if (i.outstanding == null || i.conversionRate == null) return null;
  return (i.outstanding / 1000) * i.conversionRate;
}

export function newerFilingAvailable(verifiedAt: string | null, latestPeriodicIso: string | undefined): boolean {
  if (!verifiedAt || !latestPeriodicIso) return false;
  return Date.parse(latestPeriodicIso) > Date.parse(verifiedAt);
}

export const INSTRUMENT_FIELDS = ["name", "type", "principal", "coupon", "maturity", "conversionRate", "conversionPrice", "conversionConditions", "cappedCall", "repurchases", "outstanding", "outstandingAsOf"] as const;
export type SourcedField = (typeof INSTRUMENT_FIELDS)[number];

type Src = z.infer<typeof Source>;
export const sourceFor = (i: { sources: Src[] }, field: string): Src | undefined => i.sources.find((s) => s.field === field && s.label && s.url && s.accession);

/** A value counts only if a source backs it. Anything else is withheld from the page (and listed). */
export function sourcedValue<T>(i: { sources: Src[] } & Record<string, unknown>, field: string): { value: T | null; src?: Src; unsourced: boolean } {
  const v = (i[field] ?? null) as T | null;
  if (v === null) return { value: null, unsourced: false };
  const src = sourceFor(i, field);
  return src ? { value: v, src, unsourced: false } : { value: null, unsourced: true };
}

/** shares = outstanding ÷ $1,000 × rate, computed only from two sourced inputs */
export function sourcedPossibleShares(i: Instrument): number | null {
  const o = sourcedValue<number>(i, "outstanding");
  const r = sourcedValue<number>(i, "conversionRate");
  return o.value == null || r.value == null ? null : (o.value / 1000) * r.value;
}
