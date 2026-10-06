export type SourceId = "sec" | "ir" | "x" | "news" | "market";

export type SourceHealth = {
  id: SourceId;
  label: string;
  status: "live" | "degraded" | "setup" | "error";
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  lastError?: string; // short, includes HTTP status
  itemCount: number;
  latencyMs?: number;
  note?: string;
};

export type PersonKey = "ryan_cohen" | "larry_cheng";

export type InsiderTxn = {
  ownerName: string;
  ownerCik: string;
  roles: string[];
  officerTitle?: string;
  securityTitle: string;
  isDerivative: boolean;
  code: string;
  codeLabel: string;
  acquiredDisposed: "A" | "D";
  date: string;
  shares: number | null;
  pricePerShare: number | null;
  priceNote?: string; // e.g. weighted-average footnote text
  value: number | null; // shares × price, only when both are exact
  sharesOwnedAfter: number | null;
  directIndirect: "D" | "I";
  natureOfOwnership?: string;
  accessionNumber: string;
  filingUrl: string;
  parseStatus: "ok" | "partial" | "failed";
  /** extra, non-spec helper fields */
  isWarrant?: boolean;
  priceIsAverage?: boolean;
  exercisePrice?: number | null; // derivative rows: conversionOrExercisePrice
  filedAt?: string;
};

export type WireItem = {
  id: string; // sec:<accession> | ir:<hash(url)> | x:<postId> | news:<hash(normalizedTitle)>
  sourceType: "sec" | "ir" | "x" | "news";
  source: string;
  credibility: "primary_filing" | "official_company" | "insider_direct" | "reporting_tier1" | "reporting" | "opinion";
  title: string;
  summary?: string;
  publishedAt: string; // ISO UTC
  fetchedAt: string;
  url: string;
  altLinks?: { label: string; url: string }[];
  author?: string;
  handle?: string;
  form?: string;
  formLabel?: string;
  items8k?: string[];
  accessionNumber?: string;
  filer?: { name: string; cik: string };
  subject?: { name: string; cik: string };
  people: PersonKey[];
  tags: string[];
  score: number; // 0–99, information relevance
  signal: "high" | "medium" | "low";
  scoreReasons: string[];
  insiderTxns?: InsiderTxn[];
  cluster?: { count: number; outlets: string[] };
  /** extra (non-spec) helper fields */
  newsTier?: "t1" | "t2" | "t3" | "opinion";
  outlet?: string;
  via?: string; // e.g. "via Google News" | "via SEC 8-K"
  alsoReportedBy?: { outlet: string; url: string }[];
  insiderClass?: "purchase" | "sale" | "warrant_exercise" | "exercise" | "routine" | "other" | "unparsed" | "pending";
  parseNote?: string;
  maLane?: "confirmed" | "reporting" | "rumour";
  officialStatement?: boolean;
};

export type FeedResponse = {
  items: WireItem[];
  sources: SourceHealth[];
  generatedAt: string;
};

export type SourceResult = { items: WireItem[]; health: SourceHealth };

export function signalOf(score: number): "high" | "medium" | "low" {
  return score >= 85 ? "high" : score >= 60 ? "medium" : "low";
}
