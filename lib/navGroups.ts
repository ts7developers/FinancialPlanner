import { LayoutDashboard, Wallet, Receipt, LineChart, SlidersHorizontal, FileBarChart, type LucideIcon } from "lucide-react";

export interface NavMember {
  href: string;
  label: string;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  /** First member is this group's primary/default route — what the top-level nav link points to. */
  members: NavMember[];
}

/**
 * Groups the app's 10 routes under 6 top-level nav entries so the tab bar reads at a glance
 * instead of scrolling — each underlying route/page/component is untouched, this only changes
 * how they're reached. A group with more than one member gets a small sub-nav (see SubNav.tsx)
 * once you're inside it.
 */
export const NAV_GROUPS: NavGroup[] = [
  { label: "Overview", icon: LayoutDashboard, members: [{ href: "/overview", label: "Overview" }] },
  {
    label: "Pay",
    icon: Wallet,
    members: [
      { href: "/reconcile", label: "Reconcile" },
      { href: "/income", label: "Income" },
    ],
  },
  { label: "Expenses", icon: Receipt, members: [{ href: "/expenses", label: "Expenses" }] },
  {
    label: "Wealth",
    icon: LineChart,
    members: [
      { href: "/savings", label: "Savings" },
      { href: "/accounts", label: "Accounts" },
      { href: "/super", label: "Super" },
    ],
  },
  {
    label: "Budget",
    icon: SlidersHorizontal,
    members: [
      { href: "/plan", label: "Budget" },
      { href: "/settings", label: "Settings" },
    ],
  },
  { label: "Reports", icon: FileBarChart, members: [{ href: "/reports", label: "Reports" }] },
];
