import { buildFeed } from "@/lib/feed";
import { getEnv } from "@/lib/config/env";
import { json } from "@/lib/api";
import { overallStatus } from "@/lib/health-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Source health + which optional integrations are configured (booleans only — never values). */
export async function GET() {
  const env = getEnv();
  const feed = await buildFeed();
  return json({
    status: overallStatus(feed.sources, false),
    generatedAt: feed.generatedAt,
    sources: feed.sources,
    config: {
      secUserAgent: !!env.secUserAgent,
      xBearerToken: !!env.xToken,
      marketData: !!(env.marketProvider && env.marketKey),
      dashboardPassword: !!env.dashboardPassword,
      positionJson: !!process.env.POSITION_JSON?.trim(),
    },
  });
}
