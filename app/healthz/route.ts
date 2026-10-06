export const dynamic = "force-dynamic";

/** Liveness probe for Docker/Render/Railway. Reveals nothing; intentionally not behind the password gate. */
export function GET() {
  return Response.json({ ok: true });
}
