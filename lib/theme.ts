// Palette + shared style tokens, ported from the FinancialPlanTracker.jsx prototype (spec §8).

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
