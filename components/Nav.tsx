"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGES } from "@/lib/pages";

export default function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="mx-auto max-w-[1500px] px-4">
      <ul className="scroll-x mono flex gap-1 pb-2 text-[11px] tracking-[0.12em]">
        {PAGES.map((p) => {
          const active = p.href === "/" ? path === "/" : path.startsWith(p.href);
          return (
            <li key={p.href} className="shrink-0">
              <Link href={p.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-[40px] items-center rounded px-3 ${active ? "bg-ink text-bg" : "text-muted hover:text-ink"}`}>
                {p.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
