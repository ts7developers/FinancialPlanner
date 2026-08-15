"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Wallet, PiggyBank, Home, TrendingUp, Receipt, ScrollText, Camera, Landmark } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { useIsMobile } from "@/lib/useIsMobile";
import { currentPeriod, financialYearStart, isoFromDate } from "@/lib/period";
import {
  buildPieData,
  sumYTD,
  buildSpendTrend,
  buildBorrowingCapacity,
  borrowingCapacityYearReached,
  fhssSummary,
  DEFAULT_FHSS_DEEMED_RATE,
  BORROW_MULT_LOW,
  BORROW_MULT_HIGH,
} from "@/lib/derive";
import { AUD, num } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, NAVY, FAV, PIE_COLORS } from "@/lib/theme";
import { Metric, Progress } from "@/components/ui/atoms";
import ChartSkeleton from "@/components/charts/ChartSkeleton";
import Link from "next/link";

// Recharts (~130KB gzipped) is kept out of the critical bundle for this — the default landing
// page after login — so the metrics/nav paint before that JS downloads and parses.
const DepositChart = dynamic(() => import("@/components/charts/DepositChart"), { ssr: false, loading: () => <ChartSkeleton height={260} /> });
const MoneyGoesChart = dynamic(() => import("@/components/charts/MoneyGoesChart"), { ssr: false, loading: () => <ChartSkeleton height={180} /> });
const SpendingTrendChart = dynamic(() => import("@/components/charts/SpendingTrendChart"), { ssr: false, loading: () => <ChartSkeleton height={220} /> });
const BorrowingCapacityChart = dynamic(() => import("@/components/charts/BorrowingCapacityChart"), { ssr: false, loading: () => <ChartSkeleton height={220} /> });

export default function OverviewTab() {
  const isMobile = useIsMobile();
  const { profile, categories, balances, planPath, snapshots, periods, payslips, loggedByCat, reconciliations, superContributions, D } = useAppData();

  const today = isoFromDate(new Date());
  const yr = currentPeriod(periods, today).year;
  const ytd = sumYTD(payslips, financialYearStart(today));
  const taxPaidYTD = ytd.paygwTax + (Number(profile.tax_paid_opening) || 0);

  const fhss = fhssSummary(
    superContributions.map((c) => ({ date: c.date, amount: c.amount, taxDeductible: c.tax_deductible })),
    today,
    DEFAULT_FHSS_DEEMED_RATE,
    D.cashFT
  );
  const cashDeposit = Number(balances.anzplus) || 0;
  const combinedDeposit = cashDeposit + fhss.estimatedNetReleasable;

  const chartData = planPath.map((p) => {
    const s = snapshots.find((x) => x.period_key === p.key);
    return { ...p, actualDeposit: s ? s.deposit : null };
  });

  const pieData = buildPieData(categories, D, yr);
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const spendTrend = buildSpendTrend(periods, categories, D, loggedByCat, reconciliations, today);
  const borrowPoints = buildBorrowingCapacity(profile, D, new Date().getUTCFullYear());
  const borrowReachYear = borrowingCapacityYearReached(borrowPoints);
  const loanNeeded = borrowPoints[0]?.loanNeeded ?? 0;

  const steps: [string, string, string, typeof Receipt][] = [
    ["Log", "/expenses", "each purchase as it happens", Receipt],
    ["Close", "/reconcile", "actual vs plan each payday", ScrollText],
    ["Track", "/accounts", "snapshot balances to plot", Camera],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          background: CARD,
          border: `1px solid ${LINE}`,
          borderRadius: 14,
          padding: isMobile ? "12px 14px" : "12px 18px",
          alignItems: "center",
        }}
      >
        {steps.map(([step, href, desc, Icon], i) => (
          <React.Fragment key={step}>
            <Link
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: 2,
                textAlign: "left",
                flex: isMobile ? "1 1 100%" : "0 1 auto",
              }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 8, background: "#F1ECDD", color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={16} />
              </span>
              <span>
                <span style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: MUTE, display: "block" }}>
                  {i + 1} · {step}
                </span>
                <span style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 13.5, color: NAVY, textTransform: "capitalize" }}>
                  {href.slice(1)}
                </span>{" "}
                <span style={{ fontSize: 12, color: MUTE }}>— {desc}</span>
              </span>
            </Link>
            {!isMobile && i < 2 && <span style={{ color: LINE, fontSize: 18 }}>→</span>}
          </React.Fragment>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Metric icon={Wallet} label="Net pay / fortnight" value={AUD(D.netFTfn)} sub="full-time, after tax & HECS" />
        <Metric
          icon={Landmark}
          label="Tax paid (FY YTD)"
          value={AUD(taxPaidYTD)}
          sub={
            profile.tax_paid_opening > 0
              ? `incl. ${AUD(profile.tax_paid_opening)} opening balance`
              : "from confirmed payslips"
          }
        />
        <Metric icon={TrendingUp} label="Planned surplus / fn" value={AUD(D.netFTfn - D.expFN(2027))} sub="2027+, all costs running" />
        <Metric icon={PiggyBank} label="Emergency fund" value={AUD(num(balances.emergency))} sub={`target ${AUD(profile.emergency_target)}`} accent={FAV} />
        <Metric icon={Home} label="Deposit saved" value={AUD(combinedDeposit)} sub={`cash + FHSS, 5% goal ${AUD(D.dep5)}`} />
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 18px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Road to the deposit</div>
          <div style={{ fontSize: 12, color: MUTE }}>gold line = 5% goal · dots = your snapshots</div>
        </div>
        <DepositChart data={chartData} goal={D.dep5} isMobile={isMobile} />
        <div style={{ fontSize: 11, color: MUTE, padding: "2px 0 12px" }}>
          Dots are cash (ANZ Plus) only, from each <b style={{ color: NAVY }}>Accounts</b> snapshot — &ldquo;Deposit saved&rdquo; above also includes FHSS-eligible super, so the two won&apos;t match exactly.
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, flex: "1 1 320px" }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Where the money goes</div>
          <div style={{ fontSize: 11.5, color: MUTE, marginTop: -4, marginBottom: 6 }}>per fortnight</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <MoneyGoesChart data={pieData} />
            <div style={{ flex: 1, minWidth: 150, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 10px" }}>
              {pieData.map((d, i) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MUTE }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                  {d.name} <span style={{ marginLeft: "auto", color: NAVY, fontVariantNumeric: "tabular-nums" }}>{pieTotal > 0 ? ((d.value / pieTotal) * 100).toFixed(0) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Goal progress</div>
          <Progress label="Emergency fund" value={num(balances.emergency)} target={num(profile.emergency_target)} colorFrom={FAV} />
          <Progress label="House deposit (cash + FHSS)" value={combinedDeposit} target={D.dep5} />
          <div style={{ fontSize: 11.5, color: MUTE, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
            Edit the baseline on <b style={{ color: NAVY }}>Budget</b>; log balances on <b style={{ color: NAVY }}>Accounts</b> and hit <b style={{ color: NAVY }}>Snapshot</b> to plot a dot. Full FHSS
            breakdown and fortnight-by-fortnight projection on <b style={{ color: NAVY }}>Savings</b>.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 18px 6px", flex: "1 1 380px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Plan vs actual spend</div>
            <div style={{ fontSize: 12, color: MUTE }}>last {spendTrend.length} fortnights · for a pure actuals view, see Expenses</div>
          </div>
          <SpendingTrendChart data={spendTrend} />
        </div>
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 18px 6px", flex: "1 1 380px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Borrowing capacity (estimate)</div>
            <div style={{ fontSize: 12, color: MUTE }}>
              {BORROW_MULT_LOW}–{BORROW_MULT_HIGH}× household cash income
            </div>
          </div>
          <BorrowingCapacityChart data={borrowPoints} loanNeeded={loanNeeded} />
          <div style={{ fontSize: 11.5, color: MUTE, padding: "2px 0 12px" }}>
            gold line = loan needed for house target ·{" "}
            {borrowReachYear ? (
              <>
                on track to cover it by <b style={{ color: NAVY }}>{borrowReachYear}</b>
              </>
            ) : (
              <>doesn&apos;t reach it within this projection at the current raise assumption</>
            )}
            . Rough guide only, not a lender pre-approval — edit assumptions on <b style={{ color: NAVY }}>Budget</b>.
          </div>
        </div>
      </div>
    </div>
  );
}
