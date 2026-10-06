import "server-only";
import { z } from "zod";
import { BRISBANE_ZONE } from "./watch";

const EnvSchema = z.object({
  SEC_USER_AGENT: z.string().optional(),
  X_BEARER_TOKEN: z.string().optional(),
  X_HANDLES: z.string().default("ryancohen,larryvc,gamestop"),
  X_POLL_SECONDS: z.coerce.number().int().min(60).default(300),
  X_INCLUDE_REPLIES: z.string().default("true"),
  X_INCLUDE_REPOSTS: z.string().default("false"),
  MARKET_DATA_PROVIDER: z.string().optional(),
  MARKET_DATA_API_KEY: z.string().optional(),
  DASHBOARD_PASSWORD: z.string().optional(),
  WATCH_COUNTERPARTY_TICKERS: z.string().default("EBAY"),
  DISPLAY_TIMEZONE: z.string().default(BRISBANE_ZONE),
  IR_FEED_URL: z.string().optional(),
  SEC_ACCEPTANCE_TZ: z.string().default("auto"),
});

export type Env = {
  secUserAgent?: string;
  xToken?: string;
  xHandles: string[];
  xPollSeconds: number;
  xIncludeReplies: boolean;
  xIncludeReposts: boolean;
  marketProvider?: string;
  marketKey?: string;
  dashboardPassword?: string;
  counterpartyTickers: string[];
  displayTz: string;
  irFeedUrl?: string;
  acceptanceTz: "auto" | "UTC" | "America/New_York";
};

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
const bool = (v: string) => !/^(0|false|no|off)$/i.test(v.trim());

/** Server-only. Reads process.env on every call so tests/deploys can change it. */
export function getEnv(src: Record<string, string | undefined> = process.env): Env {
  const e = EnvSchema.parse(src);
  const tz = e.SEC_ACCEPTANCE_TZ === "UTC" || e.SEC_ACCEPTANCE_TZ === "America/New_York" ? e.SEC_ACCEPTANCE_TZ : "auto";
  return {
    secUserAgent: blank(e.SEC_USER_AGENT),
    xToken: blank(e.X_BEARER_TOKEN),
    xHandles: e.X_HANDLES.split(",").map((h) => h.trim().replace(/^@/, "").toLowerCase()).filter(Boolean),
    xPollSeconds: e.X_POLL_SECONDS,
    xIncludeReplies: bool(e.X_INCLUDE_REPLIES),
    xIncludeReposts: bool(e.X_INCLUDE_REPOSTS),
    marketProvider: blank(e.MARKET_DATA_PROVIDER)?.toLowerCase(),
    marketKey: blank(e.MARKET_DATA_API_KEY),
    dashboardPassword: blank(e.DASHBOARD_PASSWORD),
    counterpartyTickers: e.WATCH_COUNTERPARTY_TICKERS.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean),
    displayTz: e.DISPLAY_TIMEZONE,
    irFeedUrl: blank(e.IR_FEED_URL),
    acceptanceTz: tz,
  };
}
