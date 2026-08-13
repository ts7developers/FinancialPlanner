"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, ScrollText, Landmark, SlidersHorizontal } from "lucide-react";
import { PAPER, NAVY } from "@/lib/theme";

const TABS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reconcile", label: "Reconcile", icon: ScrollText },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/plan", label: "Plan", icon: SlidersHorizontal },
];

export default function TabNav({ isMobile }: { isMobile: boolean }) {
  const pathname = usePathname();

  return (
    <div style={{ display: "flex", gap: 4, overflowX: "auto", scrollbarWidth: "none" }}>
      {TABS.map((t) => {
        const on = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className="tabbtn"
            style={{
              flexShrink: 0,
              background: on ? PAPER : "transparent",
              color: on ? NAVY : "#9FB0CE",
              border: "none",
              borderRadius: "10px 10px 0 0",
              padding: isMobile ? "9px 13px" : "10px 18px",
              fontSize: isMobile ? 12.5 : 13.5,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-space-grotesk), sans-serif",
              textDecoration: "none",
            }}
          >
            <t.icon size={15} /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
