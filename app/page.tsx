import LiveWire from "@/components/LiveWire";
import type { MarketView } from "@/components/Sidebar";
import { readPosition } from "@/lib/config/position";
import { loadMarket } from "@/lib/sources/market";

export const dynamic = "force-dynamic";

export default async function Page() {
  const position = readPosition();
  const m = await loadMarket();
  const market: MarketView = m.snapshot
    ? { status: "connected", provider: m.snapshot.provider, gme: m.snapshot.gme ? { price: m.snapshot.gme.price, asOf: m.snapshot.gme.asOf } : null, warrant: m.snapshot.warrant ? { price: m.snapshot.warrant.price, asOf: m.snapshot.warrant.asOf } : null }
    : { status: m.health.status === "setup" ? "setup" : "error", note: m.health.lastError };
  return <LiveWire position={position} market={market} />;
}
