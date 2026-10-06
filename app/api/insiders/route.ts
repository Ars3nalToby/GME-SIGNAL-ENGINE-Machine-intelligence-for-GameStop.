import { json, wantsForce } from "@/lib/api";
import { getInsiders } from "@/lib/insiders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return json(await getInsiders({ force: wantsForce(req) }));
}
