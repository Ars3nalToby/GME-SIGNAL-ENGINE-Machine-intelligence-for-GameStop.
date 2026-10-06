import { loadX } from "@/lib/sources/x";
import { json, wantsForce } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const r = await loadX({ force: wantsForce(req) });
  return json({ items: r.items, health: r.health });
}
