export type Tier = "t1" | "t2" | "t3" | "opinion";

/** Editable publisher tiers (SPEC §7.7). Unknown publishers are treated as T3. Match is case-insensitive substring. */
export const PUBLISHER_TIERS: Record<Tier, string[]> = {
  t1: ["reuters", "bloomberg", "wall street journal", "wsj", "financial times", "associated press", "ap news", "cnbc", "barron's", "barrons"],
  t2: ["new york times", "nytimes", "axios", "fortune", "marketwatch", "business wire", "pr newswire", "prnewswire", "globenewswire", "globe newswire"],
  t3: ["yahoo finance", "yahoo", "business insider", "benzinga", "thestreet", "investing.com"],
  opinion: ["motley fool", "seeking alpha", "investorplace", "zacks", "24/7 wall st"],
};

export function tierOf(publisher: string | undefined | null): Tier {
  const p = (publisher ?? "").toLowerCase().trim();
  if (!p) return "t3";
  // check opinion first so e.g. "Yahoo Finance (Motley Fool)" isn't promoted
  for (const tier of ["opinion", "t1", "t2", "t3"] as Tier[]) {
    if (PUBLISHER_TIERS[tier].some((n) => (n === "ap news" ? p === "ap" || p.includes("ap news") : p.includes(n)))) return tier;
  }
  if (p === "ap") return "t1";
  return "t3";
}

export const TIER_LABEL: Record<Tier, string> = { t1: "T1", t2: "T2", t3: "T3", opinion: "OPINION" };
