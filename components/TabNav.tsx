"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAPER, NAVY, GOLD } from "@/lib/theme";
import { NAV_GROUPS } from "@/lib/navGroups";

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
        {NAV_GROUPS.map((g) => {
          const primary = g.members[0].href;
          const on = g.members.some((m) => pathname.startsWith(m.href));
          return (
            <Link
              key={g.label}
              href={primary}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "9px 1px 8px",
                color: on ? GOLD : "#9FB0CE",
                textDecoration: "none",
                minWidth: 0,
              }}
            >
              <g.icon size={18} />
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  fontFamily: "var(--font-space-grotesk), sans-serif",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                }}
              >
                {g.label}
              </span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 4, overflowX: "auto", scrollbarWidth: "none" }}>
      {NAV_GROUPS.map((g) => {
        const primary = g.members[0].href;
        const on = g.members.some((m) => pathname.startsWith(m.href));
        return (
          <Link
            key={g.label}
            href={primary}
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
            <g.icon size={15} /> {g.label}
          </Link>
        );
      })}
    </div>
  );
}
