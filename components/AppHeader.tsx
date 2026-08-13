"use client";

import { useIsMobile } from "@/lib/useIsMobile";
import { INK, NAVY, GOLD } from "@/lib/theme";
import TabNav from "./TabNav";
import SignOutButton from "./SignOutButton";

export default function AppHeader() {
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        background: `linear-gradient(120deg, ${INK}, ${NAVY} 70%)`,
        color: "#fff",
        padding: isMobile ? "16px 16px 0" : "22px 26px 0",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: isMobile ? 10.5 : 12, letterSpacing: ".14em", textTransform: "uppercase", color: GOLD, fontWeight: 600 }}>
              West Carr &amp; Harvey · Fortnightly
            </div>
            <h1 style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: "4px 0 0" }}>
              The Reconciliation
            </h1>
            {!isMobile && (
              <div style={{ fontSize: 13, color: "#B9C2D6", marginTop: 2 }}>
                Reconciled each fortnight, when you get paid. Plan is the budget; your numbers are the actuals.
              </div>
            )}
          </div>
          <SignOutButton />
        </div>
        <div style={{ marginTop: isMobile ? 12 : 18 }}>
          <TabNav isMobile={isMobile} />
        </div>
      </div>
    </div>
  );
}
