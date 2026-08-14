"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Receipt, ScrollText, Landmark, LineChart, SlidersHorizontal } from "lucide-react";
import { PAPER, NAVY, GOLD } from "@/lib/theme";

const TABS = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reconcile", label: "Reconcile", icon: ScrollText },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/savings", label: "Savings", icon: LineChart },
  { href: "/plan", label: "Plan", icon: SlidersHorizontal },
];

export default function TabNav({ isMobile }: { isMobile: boolean }) {
  const pathname = usePathname();

  // Mobile gets a fixed bottom tab bar (thumb-reachable, app-like) instead of a scrollable
  // top strip that requires reaching to the top of the screen on every tab switch.
  if (isMobile) {
    return (
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 25,
          display: "flex",
          background: NAVY,
          borderTop: "1px solid rgba(255,255,255,.08)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {TABS.map((t) => {
          const on = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "9px 2px 8px",
                color: on ? GOLD : "#9FB0CE",
                textDecoration: "none",
              }}
            >
              <t.icon size={19} />
              <span style={{ fontSize: 10, fontWeight: 600, fontFamily: "var(--font-space-grotesk), sans-serif" }}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    );
  }

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
              padding: "10px 18px",
              fontSize: 13.5,
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
