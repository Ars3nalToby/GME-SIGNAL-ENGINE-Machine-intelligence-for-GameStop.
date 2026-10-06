import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP Basic Auth gate (SPEC §12). Next 16 renamed `middleware` → `proxy`.
 * DASHBOARD_PASSWORD set ⇒ every page and API route requires it (any username). Unset ⇒ public site.
 */
const digest = (s: string) => createHash("sha256").update(s).digest();

export function checkBasicAuth(header: string | null, password: string): boolean {
  const m = header?.match(/^basic\s+(.+)$/i);
  if (!m) return false;
  let decoded = "";
  try {
    // credentials are UTF-8 bytes, not Latin-1 (atob alone would break non-ASCII passwords)
    decoded = Buffer.from(m[1]!.trim(), "base64").toString("utf8");
  } catch {
    return false;
  }
  const idx = decoded.indexOf(":");
  const given = idx >= 0 ? decoded.slice(idx + 1) : decoded;
  return timingSafeEqual(digest(given), digest(password));
}

export function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  if (!password) return NextResponse.next();
  if (checkBasicAuth(req.headers.get("authorization"), password)) return NextResponse.next();
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="GME Live Wire", charset="UTF-8"', "Cache-Control": "no-store" } });
}

export const config = {
  // static build assets and the secret-free liveness probe stay open
  matcher: ["/((?!_next/static/|_next/image|favicon\\.ico$|icon\\.svg$|healthz$).*)"],
};
