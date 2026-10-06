import { loadSec } from "@/lib/sources/sec";
import { json, wantsForce } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const r = await loadSec({ force: wantsForce(req) });
  return json({ items: r.items, health: r.health });
}
