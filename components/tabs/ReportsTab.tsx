"use client";

import { useState } from "react";
import { Landmark, TrendingUp, ArrowLeftRight, Printer } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { isoFromDate, dateFromISO, dayLabel, financialYearStart } from "@/lib/period";
import { buildBalanceSheet, buildIncomeExpenditureStatement, buildCashFlowStatement } from "@/lib/derive";
import { AUD } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, NAVY, INK, FAV, UNFAV, selStyle } from "@/lib/theme";
import type { ReportLineItem } from "@/lib/derive";

type ReportKind = "balance" | "income" | "cashflow";
type RangePreset = "thisMonth" | "lastMonth" | "thisFY" | "lastFY" | "custom";

const REPORTS: { id: ReportKind; label: string; icon: typeof Landmark }[] = [
  { id: "balance", label: "Balance Sheet", icon: Landmark },
  { id: "income", label: "Income & Expenditure", icon: TrendingUp },
  { id: "cashflow", label: "Cash Flow", icon: ArrowLeftRight },
];

function monthRange(monthOffset: number, todayISO: string): [string, string] {
  const d = dateFromISO(todayISO);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset + 1, 0));
  return [isoFromDate(start), isoFromDate(end)];
}

function fyRange(yearOffset: number, todayISO: string): [string, string] {
  const thisFYStart = dateFromISO(financialYearStart(todayISO));
  const start = new Date(Date.UTC(thisFYStart.getUTCFullYear() + yearOffset, thisFYStart.getUTCMonth(), thisFYStart.getUTCDate()));
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate() - 1));
  return [isoFromDate(start), isoFromDate(end)];
}

function fmtRange(startISO: string, endISO: string): string {
  return `${dayLabel(dateFromISO(startISO))} '${String(dateFromISO(startISO).getUTCFullYear()).slice(2)} – ${dayLabel(dateFromISO(endISO))} '${String(dateFromISO(endISO).getUTCFullYear()).slice(2)}`;
}

function Section({ title, items, total, totalLabel, emptyNote }: { title: string; items: ReportLineItem[]; total: number; totalLabel: string; emptyNote?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: MUTE, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: MUTE, fontStyle: "italic" }}>{emptyNote ?? "Nothing this period"}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {items.map((item) => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
              <span style={{ color: NAVY }}>{item.label}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: item.amount < 0 ? UNFAV : NAVY }}>
                {item.amount < 0 ? `(${AUD(Math.abs(item.amount))})` : AUD(item.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700, borderTop: `1px solid ${LINE}`, marginTop: 8, paddingTop: 6, fontFamily: "var(--font-space-grotesk), sans-serif" }}>
        <span>{totalLabel}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: total < 0 ? UNFAV : NAVY }}>{total < 0 ? `(${AUD(Math.abs(total))})` : AUD(total)}</span>
      </div>
    </div>
  );
}

export default function ReportsTab() {
  const { balances, goals, payslips, miscIncome, transactions, categories, holdingLots, superContributions, transfers } = useAppData();
  const today = isoFromDate(new Date());
  const [kind, setKind] = useState<ReportKind>("balance");
  const [preset, setPreset] = useState<RangePreset>("thisMonth");
  const [customStart, setCustomStart] = useState(monthRange(0, today)[0]);
  const [customEnd, setCustomEnd] = useState(today);

  const [rangeStart, rangeEnd] =
    preset === "thisMonth" ? monthRange(0, today) : preset === "lastMonth" ? monthRange(-1, today) : preset === "thisFY" ? fyRange(0, today) : preset === "lastFY" ? fyRange(-1, today) : [customStart, customEnd];

  const balanceSheet = buildBalanceSheet(balances, goals, today);
  const incomeStatement = buildIncomeExpenditureStatement(payslips, miscIncome, transactions, categories, rangeStart, rangeEnd);
  const cashFlow = buildCashFlowStatement(payslips, miscIncome, transactions, holdingLots, superContributions, transfers, rangeStart, rangeEnd);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {REPORTS.map((r) => (
            <button
              key={r.id}
              onClick={() => setKind(r.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: kind === r.id ? GOLD : "#F1ECDD",
                color: kind === r.id ? INK : NAVY,
                border: "none",
                borderRadius: 8,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-space-grotesk), sans-serif",
              }}
            >
              <r.icon size={14} /> {r.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: NAVY, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>

      {kind !== "balance" && (
        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)} style={{ ...selStyle, width: 150 }}>
            <option value="thisMonth">This month</option>
            <option value="lastMonth">Last month</option>
            <option value="thisFY">This financial year</option>
            <option value="lastFY">Last financial year</option>
            <option value="custom">Custom range</option>
          </select>
          {preset === "custom" && (
            <>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ ...selStyle, width: 150 }} />
              <span style={{ color: MUTE, fontSize: 12.5 }}>to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ ...selStyle, width: 150 }} />
            </>
          )}
        </div>
      )}

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 24, maxWidth: 560 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 700, fontSize: 18, color: NAVY }}>{REPORTS.find((r) => r.id === kind)?.label}</div>
          <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>{kind === "balance" ? `As of ${dayLabel(dateFromISO(today))} '${String(dateFromISO(today).getUTCFullYear()).slice(2)}` : fmtRange(rangeStart, rangeEnd)}</div>
        </div>

        {kind === "balance" && (
          <>
            <Section title="Assets" items={balanceSheet.assets} total={balanceSheet.totalAssets} totalLabel="Total assets" />
            <Section title="Liabilities" items={balanceSheet.liabilities} total={balanceSheet.totalLiabilities} totalLabel="Total liabilities" emptyNote="Nothing owing" />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 15,
                fontWeight: 700,
                marginTop: 6,
                padding: "10px 14px",
                borderRadius: 8,
                background: balanceSheet.netWorth >= 0 ? "#EAF5EE" : "#FBEDE9",
                fontFamily: "var(--font-space-grotesk), sans-serif",
              }}
            >
              <span style={{ color: NAVY }}>Net worth</span>
              <span style={{ color: balanceSheet.netWorth >= 0 ? FAV : UNFAV, fontVariantNumeric: "tabular-nums" }}>{AUD(balanceSheet.netWorth)}</span>
            </div>
            <div style={{ fontSize: 11, color: MUTE, marginTop: 14, lineHeight: 1.5 }}>
              Always as of today — there&apos;s no historical per-account balance history to draw an as-of-a-past-date sheet from (only the deposit/emergency/card/HECS series on{" "}
              <b style={{ color: NAVY }}>Savings</b> tracks that over time).
            </div>
          </>
        )}

        {kind === "income" && (
          <>
            <Section title="Income" items={incomeStatement.income} total={incomeStatement.totalIncome} totalLabel="Total income" />
            <Section title="Expenses" items={incomeStatement.expenses} total={incomeStatement.totalExpenses} totalLabel="Total expenses" />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 15,
                fontWeight: 700,
                marginTop: 6,
                padding: "10px 14px",
                borderRadius: 8,
                background: incomeStatement.net >= 0 ? "#EAF5EE" : "#FBEDE9",
                fontFamily: "var(--font-space-grotesk), sans-serif",
              }}
            >
              <span style={{ color: NAVY }}>{incomeStatement.net >= 0 ? "Net surplus" : "Net deficit"}</span>
              <span style={{ color: incomeStatement.net >= 0 ? FAV : UNFAV, fontVariantNumeric: "tabular-nums" }}>{AUD(Math.abs(incomeStatement.net))}</span>
            </div>
            <div style={{ fontSize: 11, color: MUTE, marginTop: 14, lineHeight: 1.5 }}>
              Every logged expense counts the moment it happens, regardless of which account paid for it — a credit-card purchase is spend here even before the card&apos;s paid off. For
              actual cash movement, see <b style={{ color: NAVY }}>Cash Flow</b>.
            </div>
          </>
        )}

        {kind === "cashflow" && (
          <>
            <Section title={cashFlow.operating.label} items={cashFlow.operating.items} total={cashFlow.operating.total} totalLabel="Net operating cash flow" />
            <Section title={cashFlow.investing.label} items={cashFlow.investing.items} total={cashFlow.investing.total} totalLabel="Net investing cash flow" />
            <Section title={cashFlow.debtRepayment.label} items={cashFlow.debtRepayment.items} total={cashFlow.debtRepayment.total} totalLabel="Net debt repayment" />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 15,
                fontWeight: 700,
                marginTop: 6,
                padding: "10px 14px",
                borderRadius: 8,
                background: cashFlow.netCashFlow >= 0 ? "#EAF5EE" : "#FBEDE9",
                fontFamily: "var(--font-space-grotesk), sans-serif",
              }}
            >
              <span style={{ color: NAVY }}>Net cash flow</span>
              <span style={{ color: cashFlow.netCashFlow >= 0 ? FAV : UNFAV, fontVariantNumeric: "tabular-nums" }}>{cashFlow.netCashFlow < 0 ? `(${AUD(Math.abs(cashFlow.netCashFlow))})` : AUD(cashFlow.netCashFlow)}</span>
            </div>
            <div style={{ fontSize: 11, color: MUTE, marginTop: 14, lineHeight: 1.5 }}>
              Only counts money that actually left or entered a real tracked account — a credit-card purchase shows up here as debt repayment once the card&apos;s paid down, not when
              it&apos;s spent. Excludes Fun money/Cash spending, which this app doesn&apos;t track against any real balance.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
