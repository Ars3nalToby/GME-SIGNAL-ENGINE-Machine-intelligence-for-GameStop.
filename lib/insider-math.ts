import type { InsiderTxn } from "./types";

/** Aggregate shares/price for a set of rows: values only if every row parsed exactly. */
export function aggregate(rows: InsiderTxn[]): { shares: number | null; avgPrice: number | null; single: boolean; total: number | null; anyAverage: boolean } {
  const sharesOk = rows.length > 0 && rows.every((t) => t.shares !== null);
  const shares = sharesOk ? rows.reduce((a, t) => a + (t.shares as number), 0) : null;
  const priceOk = rows.length > 0 && rows.every((t) => t.pricePerShare !== null && t.shares !== null);
  let avgPrice: number | null = null;
  let total: number | null = null;
  if (priceOk && shares !== null && shares > 0) {
    total = rows.reduce((a, t) => a + (t.shares as number) * (t.pricePerShare as number), 0);
    avgPrice = total / shares;
  }
  const single = rows.length === 1 || (priceOk && new Set(rows.map((t) => t.pricePerShare)).size === 1);
  return { shares, avgPrice, single, total, anyAverage: rows.some((t) => t.priceIsAverage) };
}

