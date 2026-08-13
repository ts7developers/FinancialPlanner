import { INK, NAVY, GOLD, CARD, LINE, MUTE, GOLD_SOFT } from "@/lib/theme";

export const fieldLabelStyle: React.CSSProperties = {
  fontSize: 10.5,
  color: MUTE,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  fontWeight: 600,
  display: "block",
  marginBottom: 6,
};

export const fieldStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  fontFamily: "var(--font-inter), sans-serif",
  fontSize: 15,
  color: NAVY,
  background: "#FCFBF7",
};

export const pinFieldStyle: React.CSSProperties = {
  ...fieldStyle,
  textAlign: "center",
  letterSpacing: "0.3em",
  fontSize: 22,
  fontFamily: "var(--font-space-grotesk), sans-serif",
};

export function authButtonStyle(pending: boolean): React.CSSProperties {
  return {
    background: GOLD,
    color: INK,
    border: "none",
    borderRadius: 10,
    padding: "12px",
    fontSize: 14,
    fontWeight: 700,
    cursor: pending ? "default" : "pointer",
    opacity: pending ? 0.7 : 1,
    fontFamily: "var(--font-space-grotesk), sans-serif",
  };
}

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(120deg, ${INK}, ${NAVY} 70%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: GOLD, fontWeight: 600 }}>
            West Carr &amp; Harvey · Fortnightly
          </div>
          <h1 style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 28, fontWeight: 700, margin: "4px 0 0", color: "#fff" }}>
            The Reconciliation
          </h1>
        </div>
        <div style={{ background: CARD, borderRadius: 14, padding: 24, border: `1px solid ${LINE}` }}>{children}</div>
        <div style={{ fontSize: 11, color: GOLD_SOFT, marginTop: 16, textAlign: "center", opacity: 0.8 }}>
          General information to help you track, not financial advice.
        </div>
      </div>
    </div>
  );
}
