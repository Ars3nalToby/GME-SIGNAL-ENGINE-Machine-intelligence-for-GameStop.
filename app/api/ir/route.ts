import { loadIr } from "@/lib/sources/ir";
import { json, wantsForce } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const r = await loadIr({ force: wantsForce(req) });
  return json({ items: r.items, health: r.health, pages: r.pages ?? null, endpoint: r.endpoint ? new URL(r.endpoint).pathname : null });
}
