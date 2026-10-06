export type Tier = "t1" | "t2" | "t3" | "opinion";

/** Editable publisher tiers (SPEC §7.7). Unknown publishers are treated as T3. Match is case-insensitive substring. */
export const PUBLISHER_TIERS: Record<Tier, string[]> = {
  t1: ["reuters", "bloomberg", "wall street journal", "wsj", "financial times", "associated press", "ap news", "cnbc", "barron's", "barrons"],
  t2: ["new york times", "nytimes", "axios", "fortune", "marketwatch", "business wire", "pr newswire", "prnewswire", "globenewswire", "globe newswire"],
  t3: ["yahoo finance", "yahoo", "business insider", "benzinga", "thestreet", "investing.com"],
  opinion: ["motley fool", "seeking alpha", "investorplace", "zacks", "24/7 wall st"],
};

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OPINION_HINT = /\b(opinion|breakingviews|editorial|commentary|column|sponsored|press release)\b/i;
const matchers: Record<Tier, RegExp> = Object.fromEntries(
  (Object.keys(PUBLISHER_TIERS) as Tier[]).map((t) => [t, new RegExp(`(^|[^a-z0-9])(${PUBLISHER_TIERS[t].filter((n) => n !== "ap news").map(esc).join("|")})($|[^a-z0-9])`, "i")]),
) as Record<Tier, RegExp>;

/** Word-boundary match (so look-alike names don't inherit a tier); opinion-flavoured sections are demoted first. */
export function tierOf(publisher: string | undefined | null): Tier {
  const p = (publisher ?? "").trim();
  if (!p) return "t3";
  if (PUBLISHER_TIERS.opinion.some((n) => p.toLowerCase().includes(n)) || OPINION_HINT.test(p)) return "opinion";
  if (/^(ap|ap news|associated press)$/i.test(p)) return "t1";
  for (const tier of ["t1", "t2", "t3"] as Tier[]) if (matchers[tier].test(p)) return tier;
  return "t3";
}

export const TIER_LABEL: Record<Tier, string> = { t1: "T1", t2: "T2", t3: "T3", opinion: "OPINION" };
