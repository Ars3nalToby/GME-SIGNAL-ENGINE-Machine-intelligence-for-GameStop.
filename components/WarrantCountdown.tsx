"use client";
import { fmtExpiryBrisbane, fmtExpiryNY, warrantCountdown } from "@/lib/time";
import { useNow } from "@/lib/client/useNow";
import { WARRANT_TERMS } from "@/lib/config/watch";

export default function WarrantCountdown({ big }: { big?: boolean }) {
  const now = useNow();
  const c = now ? warrantCountdown(now) : null;
  return (
    <div>
      <div className={`mono font-semibold tracking-[0.06em] ${big ? "text-2xl" : "text-[15px]"} ${c?.expired ? "text-muted" : "text-amber"}`} suppressHydrationWarning aria-live="off">
        {c ? c.label : "WARRANT EXPIRY"}
      </div>
      <div className="mono mt-1 text-[11px] leading-relaxed text-muted">
        {fmtExpiryNY()} <span className="mx-1">·</span> {fmtExpiryBrisbane()}
      </div>
      <div className="mono mt-1 text-[10.5px] text-amber">from config — terms can change; verify on the <a className="link" href={WARRANT_TERMS.termsUrl} target="_blank" rel="noopener noreferrer">IR warrant page ↗</a></div>
    </div>
  );
}
