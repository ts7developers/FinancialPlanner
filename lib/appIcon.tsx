// Fixed literals, not lib/theme's CSS-variable exports — this renders via Satori (next/og),
// which can't parse `var(...)` in a style object. An app icon is a static brand mark anyway, so
// it doesn't need to react to the in-app light/dark toggle the way the rest of the UI does.
const ICON_BG = "#1F2A44";
const ICON_GOLD = "#C6A052";

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
        background: ICON_BG,
        borderRadius: radius,
      }}
    >
      <div
        style={{
          color: ICON_GOLD,
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
          background: ICON_GOLD,
          borderRadius: barHeight,
          marginTop: Math.round(size * 0.06),
        }}
      />
    </div>
  );
}
