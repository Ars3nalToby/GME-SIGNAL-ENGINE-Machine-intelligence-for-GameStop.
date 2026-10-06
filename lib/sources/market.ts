import "server-only";
/** Optional market-data adapter (SPEC §7.8). Never scrapes. No key ⇒ MARKET DATA NOT CONNECTED. */
import { z } from "zod";
import { cache } from "../cache";
import { getEnv } from "../config/env";
import { getJson, SetupError } from "../http";
import { makeHealth } from "../health";
import type { SourceHealth } from "../types";

export type Quote = { symbol: string; price: number; change: number | null; changePct: number | null; asOf: string | null; provider: string };
export interface MarketDataProvider {
  name: string;
  /** null = the provider has no quote for this symbol */
  quote(symbol: string): Promise<Quote | null>;
}

const FinnhubQuote = z.object({ c: z.number(), d: z.number().nullable().optional(), dp: z.number().nullable().optional(), t: z.number().optional() });

export class FinnhubProvider implements MarketDataProvider {
  name = "Finnhub";
  constructor(private key: string) {}
  async quote(symbol: string): Promise<Quote | null> {
    const j = FinnhubQuote.parse(await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`, { headers: { "x-finnhub-token": this.key } }));
    if (!j.c || !j.t) return null; // Finnhub returns zeros for unknown symbols
    return { symbol, price: j.c, change: j.d ?? null, changePct: j.dp ?? null, asOf: new Date(j.t * 1000).toISOString(), provider: this.name };
  }
}

export function providerFromEnv(): MarketDataProvider {
  const env = getEnv();
  if (!env.marketProvider || !env.marketKey) throw new SetupError("MARKET DATA NOT CONNECTED");
  if (env.marketProvider === "finnhub") return new FinnhubProvider(env.marketKey);
  throw new SetupError(`MARKET DATA NOT CONNECTED (unknown provider "${env.marketProvider}")`);
}

/** Warrant ticker spellings to try (provider symbology varies); the first that returns a quote wins. */
export const WARRANT_SYMBOL_CANDIDATES = ["GME.WS", "GMEWS", "GME-WT"];

export type MarketSnapshot = { gme: Quote | null; warrant: Quote | null; provider: string };

export async function loadMarket(opts: { force?: boolean; nowMs?: number } = {}): Promise<{ snapshot?: MarketSnapshot; health: SourceHealth }> {
  const nowMs = opts.nowMs ?? Date.now();
  let provider: MarketDataProvider;
  try {
    provider = providerFromEnv();
  } catch (e) {
    return { health: makeHealth({ id: "market", label: "Market data", itemCount: 0, nowMs, error: e, note: "MARKET DATA NOT CONNECTED" }) };
  }
  try {
    const r = await cache.get(
      "market:snapshot",
      60_000,
      async (): Promise<MarketSnapshot> => {
        const gme = await provider.quote("GME");
        let warrant: Quote | null = null;
        for (const s of WARRANT_SYMBOL_CANDIDATES) {
          try {
            warrant = await provider.quote(s);
          } catch {
            warrant = null;
          }
          if (warrant) break;
        }
        return { gme, warrant, provider: provider.name };
      },
      { force: opts.force },
    );
    return { snapshot: r.value, health: makeHealth({ id: "market", label: "Market data", itemCount: r.value.gme ? 1 : 0, nowMs, result: r, attemptedAt: nowMs, note: `${provider.name} · delay as reported by provider — check its terms` }) };
  } catch (e) {
    return { health: makeHealth({ id: "market", label: "Market data", itemCount: 0, nowMs, error: e, attemptedAt: nowMs }) };
  }
}

/** Facts only: intrinsic value and time value. */
export function warrantMath(gme: number, strike: number, warrantPrice?: number | null) {
  const intrinsic = Math.max(0, gme - strike);
  return { intrinsic, timeValue: warrantPrice != null ? warrantPrice - intrinsic : null };
}
