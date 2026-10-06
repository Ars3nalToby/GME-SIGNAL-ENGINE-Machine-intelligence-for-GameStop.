import { buildFeed } from "@/lib/feed";
import { json, wantsForce } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const { items, sources, generatedAt, xWatch, xConnected } = await buildFeed({ force: wantsForce(req) });
    return json({ items, sources, generatedAt, xWatch, xConnected });
  } catch {
    // buildFeed isolates every source; reaching here means a bug, not a source outage
    return json({ items: [], sources: [], generatedAt: new Date().toISOString(), xWatch: [], xConnected: false, error: "feed failed" }, 500);
  }
}
