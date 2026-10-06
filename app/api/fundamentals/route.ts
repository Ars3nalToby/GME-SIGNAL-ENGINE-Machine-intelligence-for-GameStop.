import { json, wantsForce } from "@/lib/api";
import { makeHealth } from "@/lib/health";
import { loadFundamentals } from "@/lib/sources/xbrl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const nowMs = Date.now();
  try {
    const r = await loadFundamentals({ force: wantsForce(req) });
    return json({ fundamentals: r.value, health: makeHealth({ id: "sec", label: "SEC XBRL", itemCount: r.value.concepts.length, nowMs, result: r }) });
  } catch (e) {
    return json({ fundamentals: null, health: makeHealth({ id: "sec", label: "SEC XBRL", itemCount: 0, nowMs, error: e }) });
  }
}
