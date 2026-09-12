// Palette + shared style tokens, ported from the FinancialPlanTracker.jsx prototype (spec §8).

import type { CSSProperties } from "react";
import type { Balances } from "./types";

// Every value below resolves to a CSS custom property (defined for both light and dark in
// globals.css) rather than a literal hex, so toggling the theme repaints every component that
// imports these — no other file needs to change when the palette itself changes.
export const INK = "var(--ink)";
export const NAVY = "var(--navy)";
export const NAVY2 = "var(--navy-2)";
export const GOLD = "var(--gold)";
export const GOLD_SOFT = "var(--gold-soft)";
export const PAPER = "var(--paper)";
export const CARD = "var(--card)";
export const LINE = "var(--line)";
export const FAV = "var(--fav)";
export const UNFAV = "var(--unfav)";
export const MUTE = "var(--mute)";

// Semantic tokens for the small set of ad-hoc colors that were previously repeated as literal
// hex strings across components — centralized here so they theme correctly too, since a bright
// light-pink "error" banner or light-green "success" banner would otherwise look broken sitting
// in a dark UI.
export const SURFACE_SUBTLE = "var(--surface-subtle)";
export const MUTE_ICON = "var(--mute-icon)";
export const WARN_BG = "var(--warn-bg)";
export const WARN_TEXT = "var(--warn-text)";
export const FAV_BG = "var(--fav-bg)";
export const FAV_TEXT = "var(--fav-text)";
export const GOLD_MUTE = "var(--gold-mute)";

// Fixed (non-theme-reactive) dark-navy accent — for banners, table headers, and the active nav
// pill that are meant to read as "a dark chip" in both light and dark mode, as opposed to
// NAVY/INK above which are primary *text* colors that intentionally invert with the theme. Text
// sitting on these two stays a literal white; text sitting on GOLD stays ON_ACCENT_DARK, since
// gold is a similar mid-tone in both palettes and dark text remains the readable choice on it.
export const SURFACE_DARK = "#1F2A44";
export const SURFACE_DARK_2 = "#2C3A5C";
export const ON_ACCENT_DARK = "#16203A";
/** A light gold label color for text sitting on SURFACE_DARK — unlike GOLD_SOFT (which
 * intentionally inverts to a dark muted-gold for use as a subtle fill/border on a normal card),
 * this one stays light in both themes since SURFACE_DARK itself never lightens. */
export const ON_ACCENT_GOLD = "#E7D6A8";

export const PIE_COLORS = [
  "#1F2A44", "#C6A052", "#2E7D5B", "#5B6B8C", "#B08636",
  "#8CA0BE", "#3F5170", "#D9C48A", "#4B7E68", "#A6B4CC", "#6E5A2A",
];

export const ACCOUNTS = ["Everyday", "ANZ Plus", "Fun money", "Credit card", "Holiday", "Cash"] as const;
export type Account = (typeof ACCOUNTS)[number];

export const ACC_COLOR: Record<Account, string> = {
  Everyday: "#5B6B8C",
  "ANZ Plus": "#1F2A44",
  "Fun money": "#C6A052",
  "Credit card": "#C0492F",
  Holiday: "#2E7D5B",
  Cash: "#8CA0BE",
};

/** Every tracked balance field with a friendly label — the full set of destinations money can
 * land in or move between (Accounts' transfer picker, misc income's account picker, etc). */
export const BALANCE_FIELDS: [keyof Omit<Balances, "user_id">, string][] = [
  ["everyday", "Everyday account"],
  ["anzplus", "ANZ Plus — deposit"],
  ["emergency", "Emergency fund"],
  ["holiday", "Holiday (cruise)"],
  ["shares", "Shares (CMC)"],
  ["superb", "Super (UniSuper)"],
  ["cc", "Credit card (owing)"],
  ["hecs", "HECS-HELP (owing)"],
];

// Padding (not just font-size) sets the touch target here — ~40px tall including the border,
// comfortably inside the ~40-44px thumb-tap guideline since this app runs as a phone PWA.
export const selStyle: CSSProperties = {
  padding: "10px 11px",
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  fontFamily: "var(--font-inter), sans-serif",
  fontSize: 13,
  color: NAVY,
  background: "var(--input-bg)",
};

export const chartTooltipStyle: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${LINE}`,
  fontSize: 12,
  fontFamily: "Inter",
  boxShadow: "0 8px 24px rgba(22,32,58,.12)",
  padding: "8px 12px",
  background: CARD,
  color: NAVY,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 11px",
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  fontFamily: "var(--font-inter), sans-serif",
  fontSize: 13,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  color: NAVY,
  background: "var(--input-bg)",
};
