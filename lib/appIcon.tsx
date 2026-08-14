import { INK, GOLD } from "@/lib/theme";

// Shared monogram used by app/icon.tsx, app/apple-icon.tsx, and app/icons/{192,512}/route.tsx —
// a navy badge with a gold "F" and a ledger-style underline accent, scaled by `size`.
export function appIconElement(size: number) {
  const fontSize = Math.round(size * 0.62);
  const barWidth = Math.round(size * 0.4);
  const barHeight = Math.max(2, Math.round(size * 0.035));
  const radius = Math.round(size * 0.2);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: INK,
        borderRadius: radius,
      }}
    >
      <div
        style={{
          color: GOLD,
          fontSize,
          fontWeight: 700,
          fontFamily: "sans-serif",
          lineHeight: 1,
        }}
      >
        F
      </div>
      <div
        style={{
          width: barWidth,
          height: barHeight,
          background: GOLD,
          borderRadius: barHeight,
          marginTop: Math.round(size * 0.06),
        }}
      />
    </div>
  );
}
