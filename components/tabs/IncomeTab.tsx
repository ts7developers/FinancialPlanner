"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Wallet, Landmark, PiggyBank, TrendingUp, Receipt, Sparkles, SplitSquareHorizontal } from "lucide-react";
import Link from "next/link";
import { useAppData } from "@/components/AppDataProvider";
import { useIsMobile } from "@/lib/useIsMobile";
import { financialYearStart, isFT, isoFromDate, periodKeyOf, periodLabel } from "@/lib/period";
import { sumYTD, buildIncomeProjection, buildFortnightSplit, fortnightCategoryBreakdown, SALARY_SCENARIOS } from "@/lib/derive";
import { AUD } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, NAVY, FAV } from "@/lib/theme";
import { Metric, Field } from "@/components/ui/atoms";
import ChartSkeleton from "@/components/charts/ChartSkeleton";
import type { IncomeTrendPoint } from "@/components/charts/IncomeTrendChart";

const IncomeTrendChart = dynamic(() => import("@/components/charts/IncomeTrendChart"), { ssr: false, loading: () => <ChartSkeleton height={220} /> });

const PROJECTION_HORIZON = 13; // ~6 months of fortnights

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  parsed: "Needs review",
  confirmed: "Confirmed",
};

export default function IncomeTab() {
  const isMobile = useIsMobile();
  const { profile, payslips, periods, categories, balances, D } = useAppData();
  const [scenarioId, setScenarioId] = useState("flat");

  const today = isoFromDate(new Date());
  const ytd = sumYTD(payslips, financialYearStart(today));
  const confirmed = payslips.filter((p) => p.status === "confirmed").sort((a, b) => (a.period_key || "").localeCompare(b.period_key || ""));
  const avgNet = confirmed.length > 0 ? ytd.net / confirmed.length : 0;

  const trend: IncomeTrendPoint[] = confirmed.slice(-13).map((p) => {
    const per = periods.find((x) => x.key === p.period_key);
    return { label: per ? periodLabel(per) : (p.period_key || "").slice(5), gross: p.gross || 0, net: p.net || 0 };
  });

  const history = payslips.slice().sort((a, b) => (b.period_key || "").localeCompare(a.period_key || ""));

  const scenario = SALARY_SCENARIOS.find((s) => s.id === scenarioId) ?? SALARY_SCENARIOS[0];
  const projection = buildIncomeProjection(profile, periods, today, scenario, PROJECTION_HORIZON);
  const projectionTrend: IncomeTrendPoint[] = projection.map((p) => ({ label: p.label, gross: p.gross, net: p.net }));
  const nextPay = projection[0];
  const projectedAnnualNet = projection.reduce((s, p) => s + p.net, 0) * (26 / PROJECTION_HORIZON);
  const ftNotYetStarted = !isFT(today, profile.ft_start);

  const split = buildFortnightSplit(profile, D, categories, balances, periods, today, 10);
  const splitCurrentIdx = split.length > 0 ? periods.findIndex((p) => p.key === split[0].key) : -1;
  const categoryBreakdown = fortnightCategoryBreakdown(categories, D, splitCurrentIdx >= 0 ? periods[splitCurrentIdx].year : new Date().getUTCFullYear());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Income</div>
        <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>
          Every confirmed payslip, year-to-date totals, and how gross vs net has tracked over time.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Metric icon={Wallet} label="Gross (FY YTD)" value={AUD(ytd.gross)} sub="from confirmed payslips" />
        <Metric icon={Landmark} label="PAYG tax (FY YTD)" value={AUD(ytd.paygwTax + (Number(profile.tax_paid_opening) || 0))} sub={profile.tax_paid_opening > 0 ? `incl. ${AUD(profile.tax_paid_opening)} opening` : undefined} />
        <Metric icon={PiggyBank} label="Super (FY YTD)" value={AUD(ytd.super)} sub="employer contributions" accent={FAV} />
        <Metric icon={TrendingUp} label="Net (FY YTD)" value={AUD(ytd.net)} sub={`avg ${AUD(avgNet, 2)} / pay`} accent={FAV} />
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
          <Sparkles size={16} color={GOLD} /> Income projection
        </div>
        <Field label="Salary scenario">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SALARY_SCENARIOS.map((s) => {
              const on = s.id === scenarioId;
              return (
                <button
                  key={s.id}
                  onClick={() => setScenarioId(s.id)}
                  style={{
                    background: on ? GOLD : "#F4EFE1",
                    color: on ? "#16203A" : NAVY,
                    border: "none",
                    borderRadius: 999,
                    padding: "7px 14px",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </Field>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
          <Metric icon={Wallet} label="Next pay (net)" value={AUD(nextPay.net, 2)} sub={nextPay.isFT ? "full-time" : "part-time"} accent={FAV} />
          <Metric icon={TrendingUp} label="Projected annual net" value={AUD(projectedAnnualNet)} sub={`at ${scenario.label.toLowerCase()}`} accent={FAV} />
          {ftNotYetStarted && <Metric icon={PiggyBank} label="Goes full-time" value={profile.ft_start} sub="pay steps up from that fortnight" />}
        </div>
        <div style={{ marginTop: 14 }}>
          <IncomeTrendChart data={projectionTrend} />
        </div>
        <div style={{ fontSize: 11, color: MUTE, marginTop: 4, paddingBottom: 12, lineHeight: 1.5 }}>
          Recomputes tax/HECS withholding and the FT/PT split at each fortnight rather than just scaling today&apos;s pay — same salary-growth
          scenarios as <b style={{ color: NAVY }}>Savings</b>. A rough guide, not a guarantee.
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "18px 18px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>
            <SplitSquareHorizontal size={16} color={GOLD} /> Fortnight-by-fortnight split
          </div>
          <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>
            Where each payslip is planned to go: budgeted categories first, then the emergency fund until it&apos;s full, then the house deposit.
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          {isMobile ? (
            <div>
              {split.map((p) => (
                <div key={p.key} style={{ padding: "11px 18px", borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                    <span>{p.label}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(p.netPay)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: MUTE, marginTop: 4 }}>
                    <span>Expenses {AUD(p.categoriesTotal)}</span>
                    {p.toEmergency > 0 && <span>→ Emergency {AUD(p.toEmergency)}</span>}
                    <span>→ Deposit {AUD(p.toDeposit)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px 100px 110px", padding: "7px 18px", fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>
                <span>Fortnight</span>
                <span style={{ textAlign: "right" }}>Net pay</span>
                <span style={{ textAlign: "right" }}>Expenses</span>
                <span style={{ textAlign: "right" }}>→ Emergency</span>
                <span style={{ textAlign: "right" }}>→ Deposit</span>
                <span style={{ textAlign: "right" }}>Deposit bal.</span>
              </div>
              {split.map((p) => (
                <div key={p.key} className="ledger-row" style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px 100px 110px", alignItems: "center", padding: "8px 18px", borderTop: `1px solid ${LINE}`, fontSize: 13 }}>
                  <span>
                    {p.label} <span style={{ color: "#C7C2B4", fontSize: 11 }}>{p.isFT ? "FT" : "PT"}</span>
                  </span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{AUD(p.netPay)}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTE }}>{AUD(p.categoriesTotal)}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.toEmergency > 0 ? FAV : "#C7C2B4" }}>{p.toEmergency > 0 ? AUD(p.toEmergency) : "—"}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: FAV, fontWeight: 500 }}>{AUD(p.toDeposit)}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{AUD(p.depositBalance)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "14px 18px", borderTop: `2px solid ${GOLD}`, background: "#F4EFE1" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Budgeted categories this fortnight ({AUD(categoryBreakdown.reduce((s, c) => s + c.amount, 0))} total)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
            {categoryBreakdown
              .filter((c) => c.amount > 0)
              .map((c) => (
                <span key={c.label} style={{ fontSize: 12, color: MUTE }}>
                  {c.label} <b style={{ color: NAVY }}>{AUD(c.amount)}</b>
                </span>
              ))}
          </div>
        </div>
        <div style={{ fontSize: 11, color: MUTE, padding: "10px 18px 14px" }}>
          Feeds the &ldquo;at current rate&rdquo; deposit estimate on <b style={{ color: NAVY }}>Savings</b>.
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 18px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Gross vs net (actual)</div>
          <div style={{ fontSize: 12, color: MUTE }}>last {trend.length} confirmed pays</div>
        </div>
        {trend.length === 0 ? (
          <div style={{ padding: "24px 0 32px", fontSize: 13, color: MUTE, textAlign: "center" }}>
            No confirmed payslips yet — upload one from <Link href="/reconcile" style={{ color: NAVY, fontWeight: 600 }}>Reconcile</Link> to start tracking income here.
          </div>
        ) : (
          <IncomeTrendChart data={trend} />
        )}
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "14px 18px", borderBottom: `1px solid ${LINE}` }}>
          <Receipt size={16} color={GOLD} />
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Payslip history</div>
        </div>
        {history.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: MUTE, textAlign: "center" }}>
            Nothing uploaded yet. Upload a payslip for any fortnight from <Link href="/reconcile" style={{ color: NAVY, fontWeight: 600 }}>Reconcile</Link>.
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 100px 100px 100px 100px 1fr", padding: "7px 18px", fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>
              <span>Fortnight</span>
              <span style={{ textAlign: "right" }}>Gross</span>
              <span style={{ textAlign: "right" }}>Tax</span>
              <span style={{ textAlign: "right" }}>Super</span>
              <span style={{ textAlign: "right" }}>Net</span>
              <span style={{ textAlign: "right" }}>Status</span>
            </div>
            {history.map((p) => {
              const per = periods.find((x) => x.key === p.period_key);
              return (
                <Link
                  key={p.id}
                  href={`/reconcile?period=${p.period_key}`}
                  className="ledger-row"
                  style={{ display: "grid", gridTemplateColumns: "1.2fr 100px 100px 100px 100px 1fr", alignItems: "center", padding: "8px 18px", borderTop: `1px solid ${LINE}`, fontSize: 13, textDecoration: "none", color: NAVY }}
                >
                  <span>{per ? periodLabel(per) : p.period_key}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTE }}>{p.gross != null ? AUD(p.gross) : "—"}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTE }}>{p.paygw_tax != null ? AUD(p.paygw_tax) : "—"}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTE }}>{p.super != null ? AUD(p.super) : "—"}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{p.net != null ? AUD(p.net) : "—"}</span>
                  <span style={{ textAlign: "right", fontSize: 11.5, color: p.status === "confirmed" ? FAV : MUTE, fontWeight: 600 }}>{STATUS_LABEL[p.status] || p.status}</span>
                </Link>
              );
            })}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: MUTE, padding: "10px 18px 14px" }}>
          Upload and confirm payslips from <b style={{ color: NAVY }}>Reconcile</b> — each one auto-fills that fortnight&apos;s actual income and lands the net pay in your Everyday balance. This page is the read-only ledger and trend.
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: MUTE }}>
        {periodKeyOf(today, profile.pay_anchor) === null && (
          <>Today falls before your pay cycle starts (see <b style={{ color: NAVY }}>Plan</b>) — YTD figures above only include payslips within tracked fortnights.</>
        )}
      </div>
    </div>
  );
}
