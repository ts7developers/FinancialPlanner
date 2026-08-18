"use client";

import { useIsMobile } from "@/lib/useIsMobile";
import SubNav from "./SubNav";

/** Adds clearance at the bottom on mobile so content isn't hidden behind the fixed tab bar. */
export default function PageContent({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: isMobile ? "16px 14px 84px" : "16px 14px 60px" }}>
      <SubNav />
      {children}
    </div>
  );
}
