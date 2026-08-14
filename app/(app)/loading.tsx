import { CARD, LINE, PAPER, GOLD } from "@/lib/theme";

export default function AppLoading() {
  const skeleton = (h: number, w: string | number = "100%") => (
    <div style={{ height: h, width: w, background: LINE, borderRadius: 8, opacity: 0.6 }} />
  );

  return (
    <div style={{ background: PAPER, minHeight: "100vh" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "16px 14px 60px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, flex: 1, minWidth: 150 }}>
              {skeleton(11, "50%")}
              <div style={{ marginTop: 10 }}>{skeleton(24, "70%")}</div>
            </div>
          ))}
        </div>
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: `3px solid ${LINE}`,
              borderTopColor: GOLD,
              animation: "spin 0.8s linear infinite",
            }}
          />
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
