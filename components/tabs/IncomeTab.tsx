"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Wallet, Landmark, PiggyBank, TrendingUp, Receipt, Sparkles, SplitSquareHorizontal, Gift, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useAppData } from "@/components/AppDataProvider";
import { useIsMobile } from "@/lib/useIsMobile";
import { currentPeriod, financialYearStart, isFT, isoFromDate, periodKeyOf, periodLabel } from "@/lib/period";
import {
  sumYTD,
  sumMiscIncomeYTD,
  buildIncomeProjection,
  buildFortnightSplit,
  fortnightCategoryBreakdown,
  sinkingFundBreakdown,
  creditCardPayoffPeriod,
  adaptiveCategoryRates,
  adaptiveExpenseTotal,
  withAdaptiveExpenses,
  SALARY_SCENARIOS,
} from "@/lib/derive";
import { AUD } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, INK, NAVY, FAV, UNFAV, selStyle } from "@/lib/theme";
import { Metric, Field, Collapsible } from "@/components/ui/atoms";
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
  const { profile, payslips, periods, categories, balances, D, miscIncome, addMiscIncome, deleteMiscIncome, recurringExpenses, goals, loggedByCat, reconciliations } = useAppData();
  const [scenarioId, setScenarioId] = useState("flat");
  const [miscDate, setMiscDate] = useState("");
  const [miscDesc, setMiscDesc] = useState("");
  const [miscAmount, setMiscAmount] = useState("");
  const [miscBusy, setMiscBusy] = useState(false);
  const [miscFlash, setMiscFlash] = useState("");

  const today = isoFromDate(new Date());
  const fyStart = financialYearStart(today);
  const ytd = sumYTD(payslips, fyStart);
  const miscYTD = sumMiscIncomeYTD(miscIncome, fyStart);
  const confirmed = payslips.filter((p) => p.status === "confirmed").sort((a, b) => (a.period_key || "").localeCompare(b.period_key || ""));
  // Same FY-scoping rule as sumYTD (period_start within the current financial year) — dividing
  // FY-only net by an all-time confirmed count would understate "avg / pay" for anyone with
  // payslips confirmed in a prior financial year.
  const confirmedThisFY = confirmed.filter((p) => p.period_start && p.period_start >= fyStart);
  const avgNet = confirmedThisFY.length > 0 ? ytd.net / confirmedThisFY.length : 0;

  useEffect(() => {
    // Client-only: the server has no notion of the user's local calendar day.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMiscDate((d) => d || today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const miscFlashMsg = (m = "Logged") => {
    setMiscFlash(m);
    setTimeout(() => setMiscFlash(""), 1300);
  };

  const onAddMisc = async () => {
    if (!(Number(miscAmount) > 0) || !miscDate) {
      miscFlashMsg("Add a date and amount");
      return;
    }
    setMiscBusy(true);
    try {
      await addMiscIncome(miscDate, miscDesc, Number(miscAmount));
      setMiscDesc("");
      setMiscAmount("");
      miscFlashMsg("Added to Everyday");
    } finally {
      setMiscBusy(false);
    }
  };

  const trend: IncomeTrendPoint[] = confirmed.slice(-13).map((p) => {
    const per = periods.find((x) => x.key === p.period_key);
    return { label: per ? periodLabel(per) : (p.period_key || "").slice(5), gross: p.gross || 0, net: p.net || 0 };
  });

  const history = payslips.slice().sort((a, b) => (b.period_key || "").localeCompare(a.period_key || ""));

  const scenario = SALARY_SCENARIOS.find((s) => s.id === scenarioId) ?? SALARY_SCENARIOS[0];
  const projection = buildIncomeProjection(profile, periods, today, scenario, PROJECTION_HORIZON);
  const projectionTrend: IncomeTrendPoint[] = projection.map((p) => ({ label: p.label, gross: p.gross, net: p.net }));
  const nextPay = projection[0];
  const projectedAnnualNet = projection.length > 0 ? (projection.reduce((s, p) => s + p.net, 0) / projection.length) * 26 : 0;
  const ftNotYetStarted = !isFT(today, profile.ft_start);

  const currentYear = currentPeriod(periods, today).year;
  const adaptiveRates = adaptiveCategoryRates(categories, D, currentYear, periods, loggedByCat, reconciliations, 3);
  const adaptiveCategories = adaptiveRates.filter((r) => r.adaptive);
  const adaptiveD = withAdaptiveExpenses(D, currentYear, adaptiveExpenseTotal(adaptiveRates));

  const split = buildFortnightSplit(profile, adaptiveD, categories, balances, recurringExpenses, goals, periods, today, 10);
  const splitCurrentIdx = split.length > 0 ? periods.findIndex((p) => p.key === split[0].key) : -1;
  const categoryBreakdown = fortnightCategoryBreakdown(categories, D, splitCurrentIdx >= 0 ? periods[splitCurrentIdx].year : new Date().getUTCFullYear());
  const sinkingFunds = sinkingFundBreakdown(recurringExpenses);
  const ccBalance = Number(balances.cc) || 0;
  const ccPayoffPoint = creditCardPayoffPeriod(buildFortnightSplit(profile, adaptiveD, categories, balances, recurringExpenses, goals, periods, today, 52));
  const ccEtaLabel = ccBalance <= 0 ? "nothing owing" : ccPayoffPoint ? ccPayoffPoint.label : "beyond this projection";

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
        <Metric icon={TrendingUp} label="Net (FY YTD)" value={AUD(ytd.net + miscYTD)} sub={miscYTD > 0 ? `incl. ${AUD(miscYTD)} misc` : `avg ${AUD(avgNet, 2)} / pay`} accent={FAV} />
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

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
          <Gift size={16} color={GOLD} /> Misc income
        </div>
        <div style={{ fontSize: 12, color: MUTE, marginBottom: 12 }}>
          A tax refund, gift, reimbursement, side gig — anything that isn&apos;t a payslip. Lands in Everyday immediately and adds to that fortnight&apos;s actual income.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Date">
            <input type="date" value={miscDate} onChange={(e) => setMiscDate(e.target.value)} style={{ ...selStyle, width: 150 }} />
          </Field>
          <Field label="Description" grow>
            <input type="text" placeholder="e.g. Tax refund" value={miscDesc} onChange={(e) => setMiscDesc(e.target.value)} style={{ ...selStyle, width: "100%", textAlign: "left" }} />
          </Field>
          <Field label="Amount">
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ color: MUTE, fontSize: 13 }}>$</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={miscAmount}
                onChange={(e) => setMiscAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onAddMisc()}
                style={{ ...selStyle, width: 100, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              />
            </div>
          </Field>
          <button
            onClick={onAddMisc}
            disabled={miscBusy}
            style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: INK, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: miscBusy ? "default" : "pointer", opacity: miscBusy ? 0.7 : 1, fontFamily: "var(--font-space-grotesk), sans-serif", height: 36 }}
          >
            <Plus size={14} /> Add
          </button>
        </div>
        {miscFlash && <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginTop: 10 }}>{miscFlash}</div>}
        {miscIncome.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}`, display: "flex", flexDirection: "column", gap: 2 }}>
            {miscIncome.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0" }}>
                <span style={{ color: MUTE }}>
                  {m.date} {m.description ? `· ${m.description}` : ""}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{AUD(m.amount, 2)}</span>
                  <button onClick={() => deleteMiscIncome(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C2B4", display: "flex" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Collapsible
        title="Fortnight-by-fortnight split"
        icon={SplitSquareHorizontal}
        subtitle={`Where each payslip is planned to go: budgeted categories and set-asides first, then the credit card, then the emergency fund until it's full${goals.length > 0 ? ", then your goals in priority order" : ""}, then the house deposit.`}
      >
        <div style={{ marginTop: 10 }}>
          {isMobile ? (
            <div>
              {split.map((p) => (
                <div key={p.key} style={{ padding: "11px 18px", borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                    <span>{p.label}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(p.netPay)}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", fontSize: 11.5, color: MUTE, marginTop: 4 }}>
                    <span>Expenses {AUD(p.categoriesTotal)}</span>
                    {p.sinkingTotal > 0 && <span>Set-aside {AUD(p.sinkingTotal)}</span>}
                    {p.toCreditCard > 0 && <span style={{ color: UNFAV }}>→ Credit card {AUD(p.toCreditCard)}</span>}
                    {p.toEmergency > 0 && <span>→ Emergency {AUD(p.toEmergency)}</span>}
                    {p.toGoalsTotal > 0 && <span>→ Goals {AUD(p.toGoalsTotal)}</span>}
                    <span>→ Deposit {AUD(p.toDeposit)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 100px 90px 90px 90px 100px", padding: "7px 18px", fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, minWidth: 860 }}>
                <span>Fortnight</span>
                <span style={{ textAlign: "right" }}>Net pay</span>
                <span style={{ textAlign: "right" }}>Expenses</span>
                <span style={{ textAlign: "right" }}>Set-aside</span>
                <span style={{ textAlign: "right" }}>→ CC</span>
                <span style={{ textAlign: "right" }}>→ Emergency</span>
                <span style={{ textAlign: "right" }}>→ Goals</span>
                <span style={{ textAlign: "right" }}>→ Deposit</span>
                <span style={{ textAlign: "right" }}>Deposit bal.</span>
              </div>
              {split.map((p) => (
                <div key={p.key} className="ledger-row" style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 100px 90px 90px 90px 100px", alignItems: "center", padding: "8px 18px", borderTop: `1px solid ${LINE}`, fontSize: 13, minWidth: 860 }}>
                  <span>
                    {p.label} <span style={{ color: "#C7C2B4", fontSize: 11 }}>{p.isFT ? "FT" : "PT"}</span>
                  </span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{AUD(p.netPay)}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTE }}>{AUD(p.categoriesTotal)}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.sinkingTotal > 0 ? MUTE : "#C7C2B4" }}>{p.sinkingTotal > 0 ? AUD(p.sinkingTotal) : "—"}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.toCreditCard > 0 ? UNFAV : "#C7C2B4", fontWeight: p.toCreditCard > 0 ? 500 : 400 }}>{p.toCreditCard > 0 ? AUD(p.toCreditCard) : "—"}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.toEmergency > 0 ? FAV : "#C7C2B4" }}>{p.toEmergency > 0 ? AUD(p.toEmergency) : "—"}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.toGoalsTotal > 0 ? GOLD : "#C7C2B4" }}>{p.toGoalsTotal > 0 ? AUD(p.toGoalsTotal) : "—"}</span>
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
        {adaptiveCategories.length > 0 && (
          <div style={{ padding: "14px 18px", borderTop: `1px solid ${LINE}`, background: "#FBEDE9" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "#8A3320" }}>
              Using recent actuals instead of the Budget plan for {adaptiveCategories.length} categor{adaptiveCategories.length === 1 ? "y" : "ies"}
            </div>
            <div style={{ fontSize: 11, color: "#8A3320", marginBottom: 8, lineHeight: 1.5 }}>
              These have run consistently over or under budget for 3+ fortnights running (same pattern flagged on <b>Reconcile</b>) — the
              waterfall above uses their recent average instead of the plan, so it reflects what&apos;s actually happening rather than a
              number that&apos;s stopped matching reality. Edit the plan on <b>Budget</b> once you&apos;re confident it&apos;s the new normal.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
              {adaptiveCategories.map((r) => (
                <span key={r.id} style={{ fontSize: 12, color: "#8A3320" }}>
                  {r.label} <span style={{ color: "#B87A69" }}>plan {AUD(r.planRate)}</span> → <b>{AUD(r.effectiveRate)}</b>
                </span>
              ))}
            </div>
          </div>
        )}
        {sinkingFunds.length > 0 && (
          <div style={{ padding: "14px 18px", borderTop: `1px solid ${LINE}` }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
              Set aside per pay for yearly/irregular bills ({AUD(sinkingFunds.reduce((s, c) => s + c.perFortnight, 0))} total)
            </div>
            <div style={{ fontSize: 11, color: MUTE, marginBottom: 8 }}>
              Rego, insurance and other recurring expenses outside the monthly budget — set this aside each pay (e.g. in a separate ANZ Plus sub-account) so the lump sum is ready when it&apos;s due.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
              {sinkingFunds.map((s) => (
                <span key={s.label} style={{ fontSize: 12, color: MUTE }}>
                  {s.label} <span style={{ color: "#C7C2B4" }}>({s.frequency})</span> <b style={{ color: NAVY }}>{AUD(s.perFortnight, 2)}/fn</b>
                </span>
              ))}
            </div>
          </div>
        )}
        <div style={{ fontSize: 11, color: MUTE, padding: "10px 18px 14px" }}>
          Credit card is paid down first from whatever&apos;s left after expenses and set-asides, before the emergency fund or deposit get anything
          {ccBalance > 0 && (
            <>
              {" "}— at that rate, paid off by <b style={{ color: NAVY }}>{ccEtaLabel}</b>
            </>
          )}
          . Feeds the &ldquo;at current rate&rdquo; deposit estimate and net worth projection on <b style={{ color: NAVY }}>Savings</b>.
        </div>
      </Collapsible>

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

      <Collapsible title="Payslip history" icon={Receipt} subtitle={history.length === 0 ? "Nothing uploaded yet." : `${history.length} payslip${history.length === 1 ? "" : "s"} logged.`}>
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
      </Collapsible>

      <div style={{ fontSize: 11.5, color: MUTE }}>
        {periodKeyOf(today, profile.pay_anchor) === null && (
          <>Today falls before your pay cycle starts (see <b style={{ color: NAVY }}>Budget</b>) — YTD figures above only include payslips within tracked fortnights.</>
        )}
      </div>
    </div>
  );
}
