"use client";

import { useRouter, usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useIsMobile } from "@/lib/useIsMobile";
import { GOLD, INK } from "@/lib/theme";

/** Mobile-only shortcut to the expense form — desktop already keeps it visible at all times. */
export default function QuickAddFab() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();

  if (!isMobile || pathname === "/expenses") return null;

  return (
    <button
      onClick={() => router.push("/expenses?add=1")}
      aria-label="Add expense"
      style={{
        position: "fixed",
        right: 18,
        bottom: "calc(72px + env(safe-area-inset-bottom))",
        width: 54,
        height: 54,
        borderRadius: "50%",
        background: GOLD,
        color: INK,
        border: "none",
        boxShadow: "0 8px 20px rgba(22,32,58,.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 30,
        cursor: "pointer",
      }}
    >
      <Plus size={26} />
    </button>
  );
}
