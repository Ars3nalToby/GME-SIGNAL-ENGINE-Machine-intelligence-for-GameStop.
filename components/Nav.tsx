"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGES } from "@/lib/pages";

export default function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="scroll-x order-3 w-full md:order-none md:w-auto">
      <ul className="seg min-w-max">
        {PAGES.map((p) => {
          const active = p.href === "/" ? path === "/" : path.startsWith(p.href);
          return (
            <li key={p.href} className="flex">
              <Link href={p.href} aria-current={active ? "page" : undefined}>
                {p.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
