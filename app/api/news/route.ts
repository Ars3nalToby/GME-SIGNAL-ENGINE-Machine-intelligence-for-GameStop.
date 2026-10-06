import { loadNews } from "@/lib/sources/news";
import { json, wantsForce } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const r = await loadNews({ force: wantsForce(req) });
  return json({ items: r.items, health: r.health });
}
