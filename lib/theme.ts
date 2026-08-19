// Palette + shared style tokens, ported from the FinancialPlanTracker.jsx prototype (spec §8).

import type { CSSProperties } from "react";
import type { Balances } from "./types";

export const INK = "#16203A";
export const NAVY = "#1F2A44";
export const NAVY2 = "#2C3A5C";
export const GOLD = "#C6A052";
export const GOLD_SOFT = "#E7D6A8";
export const PAPER = "#F7F5EF";
export const CARD = "#FFFFFF";
export const LINE = "#E4E0D4";
export const FAV = "#2E7D5B";
export const UNFAV = "#C0492F";
export const MUTE = "#6B7280";

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

export const selStyle: CSSProperties = {
  padding: "7px 9px",
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  fontFamily: "var(--font-inter), sans-serif",
  fontSize: 13,
  color: NAVY,
  background: "#FCFBF7",
};

export const chartTooltipStyle: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${LINE}`,
  fontSize: 12,
  fontFamily: "Inter",
  boxShadow: "0 8px 24px rgba(22,32,58,.12)",
  padding: "8px 12px",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  fontFamily: "var(--font-inter), sans-serif",
  fontSize: 13,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  color: NAVY,
  background: "#FCFBF7",
};
