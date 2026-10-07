"use client";
import { useMemo, useState } from "react";
import type { WireItem } from "@/lib/types";
import { laneCountFor, laneDuration, pickDrift, shorten, toLanes } from "@/lib/drift";
import { sourceColor } from "@/lib/format";

function Chip({ item, read, onCatch, hidden }: { item: WireItem; read: boolean; onCatch: () => void; hidden?: boolean }) {
  const high = item.signal === "high";
  return (
    <button
      type="button"
      className={`dchip ${high ? "dchip-high" : ""} ${read ? "dchip-read" : ""}`}
      onClick={onCatch}
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden || undefined}
      aria-label={`Read: ${item.title} — ${item.source}, ${item.signal} signal ${item.score}`}
      title="Click to catch and read"
    >
      <span className="dot !h-2 !w-2 shrink-0" style={{ background: sourceColor(item), boxShadow: `0 0 8px ${sourceColor(item)}` }} aria-hidden />
      <span className="t">{shorten(item.title, high ? 96 : 76)}</span>
      <span className={`mono shrink-0 text-[10.5px] ${high ? "text-[#ff6b78]" : "text-muted"}`}>{item.score}</span>
    </button>
  );
}

/**
 * Real wire headlines drifting across the page. Hover/focus pauses the band; click "catches" a headline and opens
 * it in the reader. Respects prefers-reduced-motion (becomes a scrollable row). Never shows anything that is not on the wire.
 */
export default function NewsDrift({ items, now, readIds, onCatch }: { items: WireItem[]; now: number; readIds: Set<string>; onCatch: (list: WireItem[], index: number) => void }) {
  const [paused, setPaused] = useState(false);
  const picked = useMemo(() => pickDrift(items, now), [items, now]);
  const lanes = useMemo(() => toLanes(picked, laneCountFor(picked.length)), [picked]);
  if (picked.length === 0) return null;

  return (
    <section aria-label="Catch the wire: drifting headlines" className="mb-9">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="panel-title">Catch the wire · {picked.length} headline{picked.length === 1 ? "" : "s"} adrift</h2>
        <div className="flex items-center gap-3">
          <span className="mono hidden text-[10.5px] text-muted sm:inline">hover to pause · click to read</span>
          <button className="btn !min-h-[30px]" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>{paused ? "▶ Play" : "❚❚ Pause"}</button>
        </div>
      </div>
      <div className={`drift ${paused ? "paused" : ""}`}>
        {lanes.map((lane, li) => {
          const dur = laneDuration(lane.length) * (1 + li * 0.18);
          return (
            <div key={li} className={`drift-lane ${li % 2 === 1 ? "rev" : ""}`} style={{ ["--dur" as string]: `${dur}s`, ["--delay" as string]: `${-li * 17}s` }}>
              {lane.map((it) => (
                <Chip key={it.id} item={it} read={readIds.has(it.id)} onCatch={() => onCatch(picked, picked.indexOf(it))} />
              ))}
              <div className="drift-dup contents" aria-hidden>
                {lane.map((it) => (
                  <Chip key={`d-${it.id}`} item={it} read={readIds.has(it.id)} hidden onCatch={() => onCatch(picked, picked.indexOf(it))} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
