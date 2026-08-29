// Presentational atoms — ported verbatim (styling + behaviour) from FinancialPlanTracker.jsx.

import { useState } from "react";
import { ChevronDown, Info, type LucideIcon } from "lucide-react";
import { CARD, LINE, MUTE, GOLD, GOLD_SOFT, NAVY, INK, FAV, UNFAV } from "@/lib/theme";
import { AUD } from "@/lib/money";

/** A card whose body starts hidden (or shown, via `defaultOpen`) behind a clickable header — for secondary/detail sections that would otherwise make a busy tab even longer. The header stays visible either way, so a `subtitle` summary is never lost when collapsed. */
export function Collapsible({
  title,
  icon: Icon,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  subtitle?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 18, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16, color: NAVY }}>
            {Icon && <Icon size={16} color={GOLD} />} {title}
          </div>
          {subtitle && <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <ChevronDown size={18} color={MUTE} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
      </button>
      {open && <div style={{ padding: "0 0 18px" }}>{children}</div>}
    </div>
  );
}

export function Row({
  label,
  plan,
  actualEl,
  variance,
  isIncome,
  isMobile,
}: {
  label: string;
  plan: number;
  actualEl: React.ReactNode;
  variance: number | null;
  isIncome?: boolean;
  isMobile: boolean;
}) {
  if (isMobile) {
    return (
      <div style={{ padding: "11px 14px", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: isIncome ? 700 : 600 }}>{label}</span>
          {variance === null ? <span style={{ fontSize: 12, color: "#C7C2B4" }}>—</span> : <VarTag v={variance} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: MUTE, flexShrink: 0, width: 82 }}>Plan {AUD(plan)}</span>
          <div style={{ flex: 1 }}>{actualEl}</div>
        </div>
      </div>
    );
  }
  return (
    <div
      className="ledger-row"
      style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", alignItems: "center", borderBottom: `1px solid ${LINE}` }}
    >
      <div style={{ padding: "9px 16px", fontSize: 13.5, fontWeight: isIncome ? 600 : 400 }}>{label}</div>
      <div style={{ padding: "9px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13.5, color: MUTE }}>
        {AUD(plan)}
      </div>
      <div style={{ padding: "6px 12px" }}>{actualEl}</div>
      <div style={{ padding: "9px 16px", textAlign: "right" }}>
        {variance === null ? <span style={{ color: "#C7C2B4" }}>—</span> : <VarTag v={variance} />}
      </div>
    </div>
  );
}

export function Metric({
  icon: Icon,
  label,
  value,
  sub,
  accent = GOLD,
}: {
  icon: LucideIcon;
  label: React.ReactNode;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 18px", flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: MUTE, fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}>
        <Icon size={14} color={accent} /> {label}
      </div>
      <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 26, fontWeight: 600, color: NAVY, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function Progress({
  value,
  target,
  colorFrom = GOLD,
  label,
}: {
  value: number;
  target: number;
  colorFrom?: string;
  label: React.ReactNode;
}) {
  const pct = target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTE, marginBottom: 6 }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {AUD(value)} / {AUD(target)} · {pct.toFixed(0)}%
        </span>
      </div>
      <div style={{ height: 10, background: "#EEEADD", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${colorFrom}, ${GOLD_SOFT})`, transition: "width .5s" }} />
      </div>
    </div>
  );
}

export function Field({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: grow ? "1 1 120px" : "0 0 auto", minWidth: grow ? 120 : "auto" }}>
      <span style={{ fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  );
}

export function Panel({
  title,
  children,
  icon: Icon,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  icon?: LucideIcon;
  /** When true, the header becomes clickable and the body can be hidden — for settings that are set once and rarely revisited. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const showBody = !collapsible || open;
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
      <div
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        style={{
          fontFamily: "var(--font-space-grotesk), sans-serif",
          fontWeight: 600,
          fontSize: 15,
          marginBottom: showBody ? 12 : 0,
          color: NAVY,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 7,
          cursor: collapsible ? "pointer" : "default",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {Icon && <Icon size={16} color={GOLD} />}
          {title}
        </span>
        {collapsible && <ChevronDown size={16} color={MUTE} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />}
      </div>
      {showBody && children}
    </div>
  );
}

export function PInput({
  label,
  value,
  onChange,
  onBlur,
  prefix,
  suffix,
  type = "number",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  onBlur?: () => void;
  prefix?: string;
  suffix?: string;
  type?: "number" | "date";
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "5px 0" }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 3, width: type === "date" ? 150 : 130 }}>
        {prefix && <span style={{ color: MUTE, fontSize: 13 }}>{prefix}</span>}
        <input
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "7px 9px",
            border: `1px solid ${LINE}`,
            borderRadius: 8,
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: 13,
            textAlign: type === "date" ? "left" : "right",
            fontVariantNumeric: "tabular-nums",
            color: NAVY,
            background: "#FCFBF7",
          }}
        />
        {suffix && <span style={{ color: MUTE, fontSize: 13 }}>{suffix}</span>}
      </div>
    </div>
  );
}

export function Derived({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}`, display: "flex", flexDirection: "column", gap: 5 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
          <span style={{ color: MUTE }}>{k}</span>
          <span style={{ fontWeight: 600, color: FAV, fontVariantNumeric: "tabular-nums", fontFamily: "var(--font-space-grotesk), sans-serif" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function VarTag({ v }: { v: number }) {
  const color = Math.abs(v) < 0.005 ? MUTE : v >= 0 ? FAV : UNFAV;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return (
    <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13.5, fontWeight: 600, color }}>
      {sign}
      {AUD(Math.abs(v))}
    </span>
  );
}

export function Cell2({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <div style={{ padding: "12px 16px", textAlign: right ? "right" : "left", fontVariantNumeric: "tabular-nums", color: NAVY }}>{children}</div>;
}

export function Toast({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 22,
        transform: "translateX(-50%)",
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: INK,
        color: "#fff",
        borderRadius: 10,
        padding: "11px 12px 11px 16px",
        boxShadow: "0 8px 24px rgba(22,32,58,.35)",
        fontSize: 13,
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{ background: "none", border: "none", color: GOLD, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: "4px 6px", fontFamily: "var(--font-space-grotesk), sans-serif", flexShrink: 0 }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** A small "ⓘ" that reveals a short plain-English explanation on hover or tap — for jargon
 * (FHSS, sinking fund, variance, ...) that shouldn't need a trip to Google to understand. */
export function InfoTip({ text, iconColor = MUTE }: { text: string; iconColor?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 4 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="More info"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", color: iconColor, lineHeight: 0 }}
      >
        <Info size={13} />
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 7px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: INK,
            color: "#fff",
            fontSize: 11.5,
            fontWeight: 400,
            textTransform: "none",
            letterSpacing: "normal",
            lineHeight: 1.45,
            padding: "8px 10px",
            borderRadius: 8,
            width: 220,
            zIndex: 50,
            boxShadow: "0 8px 20px rgba(22,32,58,.3)",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function Stat({ k, v, color = "#fff" }: { k: string; v: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#9FB0CE" }}>{k}</div>
      <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 18, fontWeight: 600, color, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{v}</div>
    </div>
  );
}
