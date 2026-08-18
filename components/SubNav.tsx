"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAVY, GOLD, INK } from "@/lib/theme";
import { NAV_GROUPS } from "@/lib/navGroups";

/** Renders a small pill switcher between sibling pages within the current nav group — e.g.
 * Reconcile/Income under "Pay" — since those pages are still separate routes, just no longer
 * separate top-level tabs. Renders nothing for a group with only one page. */
export default function SubNav() {
  const pathname = usePathname();
  const group = NAV_GROUPS.find((g) => g.members.some((m) => pathname.startsWith(m.href)));
  if (!group || group.members.length < 2) return null;

  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
      {group.members.map((m) => {
        const on = pathname.startsWith(m.href);
        return (
          <Link
            key={m.href}
            href={m.href}
            style={{
              padding: "6px 15px",
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: "var(--font-space-grotesk), sans-serif",
              textDecoration: "none",
              background: on ? GOLD : "#F1ECDD",
              color: on ? INK : NAVY,
            }}
          >
            {m.label}
          </Link>
        );
      })}
    </div>
  );
}
