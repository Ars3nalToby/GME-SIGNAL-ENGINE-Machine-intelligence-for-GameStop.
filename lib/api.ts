import { NextResponse } from "next/server";

export const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** `?force=1` is only a hint: lib/cache.ts ignores it for entries younger than 30 s. */
export function wantsForce(req: Request): boolean {
  return new URL(req.url).searchParams.get("force") === "1";
}
