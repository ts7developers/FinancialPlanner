"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, FileBarChart, Wand2, TrendingDown, TrendingUp } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { useIsMobile } from "@/lib/useIsMobile";
import { currentPeriod, financialYearStart, isFT, isoFromDate, periodLabel } from "@/lib/period";
import { plannedIncomeFN, reconcileCategoryRows, summarizeReconciliation, sumYTD, buildVarianceReport, buildVarianceInsights } from "@/lib/derive";
import { AUD } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, NAVY, INK, GOLD_SOFT, FAV, UNFAV, inputStyle } from "@/lib/theme";
import { Row, Cell2, VarTag, Stat } from "@/components/ui/atoms";
import PayslipPanel from "@/components/PayslipPanel";

export default function ReconcileTab() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, categories, periods, D, loggedByCat, reconciliations, setReconciliation, payslips } = useAppData();

  const [period, setPeriod] = useState(() => {
    const fromQuery = searchParams.get("period");
    if (fromQuery && periods.some((p) => p.key === fromQuery)) return fromQuery;
    return currentPeriod(periods, isoFromDate(new Date())).key;
  });
  const rec = reconciliations[period];

  useEffect(() => {
    // Arrived via a deep link (e.g. from Income's payslip history) — drop the marker once used.
    if (searchParams.get("period")) router.replace("/reconcile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [incomeInput, setIncomeInput] = useState(() => (rec?.actual_income == null ? "" : String(rec.actual_income)));
  const [overridesInput, setOverridesInput] = useState<Record<string, string>>(() => rec?.actual_overrides ?? {});
  const [flashMsg, setFlashMsg] = useState("");

  // Reset the editing buffers when the selected period changes — the "adjusting state
  // during render" pattern (react.dev/learn/you-might-not-need-an-effect), not an effect,
  // so the input never flashes stale data from the previous period.
  const [bufferedPeriod, setBufferedPeriod] = useState(period);
  if (period !== bufferedPeriod) {
    setBufferedPeriod(period);
    setIncomeInput(rec?.actual_income == null ? "" : String(rec.actual_income));
    setOverridesInput(rec?.actual_overrides ?? {});
  }

  const flash = (m = "Saved") => {
    setFlashMsg(m);
    setTimeout(() => setFlashMsg(""), 1300);
  };

  const perObj = periods.find((p) => p.key === period) || periods[0];
  const planInc = plannedIncomeFN(perObj, profile, D);
  const yr = perObj.year;
  const ytd = sumYTD(payslips, financialYearStart(period));

  const catRows = reconcileCategoryRows(categories, D, yr, loggedByCat[period], overridesInput);
  const summary = summarizeReconciliation(
    planInc,
    { period_key: period, actual_income: incomeInput === "" ? null : Number(incomeInput), actual_overrides: overridesInput },
    catRows
  );

  const varianceReport = buildVarianceReport(profile, categories, D, periods, loggedByCat, reconciliations);
  const varianceRows = varianceReport.rows.filter((r) => r.plannedTotal > 0 || r.actualTotal > 0).sort((a, b) => a.variance - b.variance);
  const insights = buildVarianceInsights(categories, D, periods, loggedByCat, reconciliations);

  const commitIncome = () => {
    setReconciliation(period, { actual_income: incomeInput === "" ? null : Number(incomeInput) });
    flash();
  };
  const commitActual = (catId: string, value: string) => {
    // Untouched fields display the auto-filled logged total but never got an onChange, so
    // overridesInput[catId] is still undefined here — skip writing an override so the row
    // keeps auto-tracking new transactions logged against this category for the period.
    if (overridesInput[catId] === undefined) return;
    const nextOverrides = { ...overridesInput, [catId]: value };
    setOverridesInput(nextOverrides);
    setReconciliation(period, { actual_overrides: nextOverrides });
    flash();
  };

  const autofillableCount = catRows.filter((r) => r.logged > 0 && (overridesInput[r.id] === undefined || overridesInput[r.id] === "")).length;
  const autofillFromExpenses = () => {
    const nextOverrides = { ...overridesInput };
    catRows.forEach((r) => {
      if (r.logged > 0 && (overridesInput[r.id] === undefined || overridesInput[r.id] === "")) {
        nextOverrides[r.id] = String(r.logged);
      }
    });
    setOverridesInput(nextOverrides);
    setReconciliation(period, { actual_overrides: nextOverrides });
    flash("Autofilled from Expenses");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Fortnight rec</div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          style={{ padding: "8px 12px", border: `1px solid ${LINE}`, borderRadius: 8, background: CARD, fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 14, color: NAVY, fontWeight: 600 }}
        >
          {periods.map((p) => (
            <option key={p.key} value={p.key}>
              {periodLabel(p)}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: MUTE, padding: "3px 10px", background: "#EFE9D9", borderRadius: 999 }}>
          {isFT(perObj.key, profile.ft_start) ? "Full-time" : "Part-time"}
        </span>
        <button
          onClick={autofillFromExpenses}
          disabled={autofillableCount === 0}
          title={autofillableCount === 0 ? "Nothing new logged on Expenses for this fortnight" : `Lock in ${autofillableCount} categor${autofillableCount === 1 ? "y" : "ies"} from Expenses`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: autofillableCount === 0 ? "transparent" : GOLD,
            color: autofillableCount === 0 ? MUTE : INK,
            border: autofillableCount === 0 ? `1px solid ${LINE}` : "none",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: autofillableCount === 0 ? "default" : "pointer",
            opacity: autofillableCount === 0 ? 0.6 : 1,
            fontFamily: "var(--font-space-grotesk), sans-serif",
          }}
        >
          <Wand2 size={13} /> Autofill from Expenses{autofillableCount > 0 ? ` (${autofillableCount})` : ""}
        </button>
        {summary.anyActual && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#2E7D5B", fontWeight: 600 }}>
            <Check size={14} /> Reconciled
          </span>
        )}
        {flashMsg && <span style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>{flashMsg}</span>}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px" }}>
          <PayslipPanel periodKey={period} />
        </div>
        <div style={{ flex: "1 1 260px", background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 8 }}>
            Year to date
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: MUTE }}>Gross</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(ytd.gross)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: MUTE }}>PAYG tax{profile.tax_paid_opening > 0 ? " (incl. opening)" : ""}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(ytd.paygwTax + (Number(profile.tax_paid_opening) || 0))}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: MUTE }}>Super</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(ytd.super)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, borderTop: `1px solid ${LINE}`, paddingTop: 4, marginTop: 2 }}>
              <span>Net</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(ytd.net)}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: MUTE, marginTop: 8 }}>From confirmed payslips this financial year.</div>
        </div>
      </div>

      {!summary.anyActual && !loggedByCat[period] && (
        <div style={{ background: "#F4EFE1", border: `1px solid ${GOLD_SOFT}`, borderRadius: 12, padding: "12px 16px", fontSize: 12.5, color: NAVY, lineHeight: 1.5 }}>
          Nothing logged for this fortnight yet. Log expenses on <b>Expenses</b> and they&apos;ll fill in below automatically — or type an actual straight into a row to override it.
        </div>
      )}

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
        {!isMobile && (
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", background: NAVY, color: "#fff", fontSize: 11.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
            <div style={{ padding: "11px 16px" }}>Line</div>
            <div style={{ padding: "11px 16px", textAlign: "right" }}>Planned</div>
            <div style={{ padding: "11px 16px", textAlign: "right" }}>Actual</div>
            <div style={{ padding: "11px 16px", textAlign: "right" }}>Variance</div>
          </div>
        )}
        <Row
          isMobile={isMobile}
          label="Net pay"
          plan={planInc}
          isIncome
          actualEl={
            <input
              style={inputStyle}
              type="number"
              inputMode="decimal"
              placeholder={planInc.toFixed(0)}
              value={incomeInput}
              onChange={(e) => setIncomeInput(e.target.value)}
              onBlur={commitIncome}
            />
          }
          variance={summary.actInc === null ? null : summary.actInc - planInc}
        />
        <div style={{ padding: "8px 16px 4px", fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: MUTE, background: "#FBF9F2" }}>Expenses</div>
        {catRows.map((r) => (
          <Row
            key={r.id}
            isMobile={isMobile}
            label={r.label}
            plan={r.plan}
            variance={r.variance}
            actualEl={
              <div>
                <input
                  style={{ ...inputStyle, color: overridesInput[r.id] === undefined && r.logged > 0 ? "#2E7D5B" : inputStyle.color }}
                  type="number"
                  inputMode="decimal"
                  placeholder={r.plan.toFixed(0)}
                  value={overridesInput[r.id] ?? (r.logged > 0 ? String(r.logged) : "")}
                  onChange={(e) => setOverridesInput((o) => ({ ...o, [r.id]: e.target.value }))}
                  onBlur={(e) => commitActual(r.id, e.target.value)}
                />
                {r.logged > 0 && !r.hasManual && (
                  <div style={{ fontSize: 10, color: "#2E7D5B", textAlign: "right", marginTop: 2 }}>auto-filled from Expenses</div>
                )}
              </div>
            }
          />
        ))}
        {isMobile ? (
          <div style={{ background: "#F4EFE1", borderTop: `2px solid ${GOLD}`, padding: "12px 14px", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>Total expenses</span>
              {summary.anyActual ? <VarTag v={summary.expVar} /> : <span style={{ color: MUTE }}>—</span>}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 12, color: MUTE }}>
              <span>Plan {AUD(summary.totPlanExp)}</span>
              <span>Actual {summary.anyActual ? AUD(summary.totActExp) : "—"}</span>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", background: "#F4EFE1", borderTop: `2px solid ${GOLD}`, fontWeight: 700, fontFamily: "var(--font-space-grotesk), sans-serif" }}>
            <Cell2>Total expenses</Cell2>
            <Cell2 right>{AUD(summary.totPlanExp)}</Cell2>
            <Cell2 right>{summary.anyActual ? AUD(summary.totActExp) : "—"}</Cell2>
            <Cell2 right>{summary.anyActual ? <VarTag v={summary.expVar} /> : "—"}</Cell2>
          </div>
        )}
      </div>

      <div style={{ background: `linear-gradient(120deg, ${INK}, ${NAVY})`, color: "#fff", borderRadius: 14, padding: "18px 20px", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: GOLD_SOFT }}>Surplus this fortnight</div>
          <div style={{ display: "flex", gap: 26, marginTop: 6 }}>
            <Stat k="Planned" v={AUD(summary.planSurplus)} />
            <Stat k="Actual" v={summary.anyActual ? AUD(summary.actSurplus) : "—"} />
            <Stat
              k="Variance"
              v={summary.anyActual ? (summary.surplusVar >= 0 ? "+" : "−") + AUD(Math.abs(summary.surplusVar)) : "—"}
              color={summary.anyActual ? (summary.surplusVar >= 0 ? "#7BE0AE" : "#F0A08C") : "#fff"}
            />
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: "#C4CDE0", maxWidth: 300, lineHeight: 1.5 }}>
          A <b style={{ color: "#7BE0AE" }}>favourable</b> variance means you spent less than planned this pay — extra to push to the deposit.
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "18px 18px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>
            <FileBarChart size={16} color={GOLD} /> Variance report
          </div>
          <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>
            Budget vs actual, summed across every fortnight you&apos;ve reconciled so far.
          </div>
        </div>
        {varianceReport.periodsIncluded === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: MUTE, textAlign: "center" }}>
            Nothing reconciled yet. Log expenses on <b style={{ color: NAVY }}>Expenses</b> or confirm a payslip above, and this report builds itself up fortnight by fortnight.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "10px 18px 14px" }}>
              <Stat2 label="Fortnights reconciled" value={String(varianceReport.periodsIncluded)} />
              <Stat2 label="Income variance" value={AUD(Math.abs(varianceReport.incomeVariance))} sign={varianceReport.incomeVariance} />
              <Stat2 label="Expense variance" value={AUD(Math.abs(varianceReport.totalExpenseVariance))} sign={varianceReport.totalExpenseVariance} />
              <Stat2 label="Surplus variance" value={AUD(Math.abs(varianceReport.surplusVariance))} sign={varianceReport.surplusVariance} />
            </div>
            {insights.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 18px 14px" }}>
                {insights.map((ins) => (
                  <div
                    key={ins.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 8,
                      fontSize: 12.5,
                      background: ins.favorable ? "#EAF5EE" : "#FBEDE9",
                      color: ins.favorable ? "#1E5C3B" : "#8A3320",
                    }}
                  >
                    {ins.favorable ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                    {ins.message}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 100px 100px 100px", padding: "7px 18px", fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600, borderTop: `1px solid ${LINE}` }}>
              <span>Category</span>
              <span style={{ textAlign: "right" }}>Budgeted</span>
              <span style={{ textAlign: "right" }}>Actual</span>
              <span style={{ textAlign: "right" }}>Variance</span>
            </div>
            {varianceRows.map((r) => (
              <div key={r.id} className="ledger-row" style={{ display: "grid", gridTemplateColumns: "1.3fr 100px 100px 100px", alignItems: "center", padding: "8px 18px", borderTop: `1px solid ${LINE}`, fontSize: 13 }}>
                <span>{r.label}</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTE }}>{AUD(r.plannedTotal)}</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTE }}>{AUD(r.actualTotal)}</span>
                <span style={{ textAlign: "right" }}>
                  <VarTag v={r.variance} />
                </span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: MUTE, padding: "10px 18px 14px", borderTop: `1px solid ${LINE}` }}>
              A category with nothing logged still counts its full budgeted amount as favourable variance — same rule as the per-fortnight table above.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat2({ label, value, sign }: { label: string; value: string; sign?: number }) {
  const color = sign === undefined ? NAVY : sign >= 0 ? FAV : UNFAV;
  return (
    <div style={{ background: "#FBF9F2", border: `1px solid ${LINE}`, borderRadius: 10, padding: "9px 14px", minWidth: 140 }}>
      <div style={{ fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 17, fontWeight: 600, color, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        {sign !== undefined && sign !== 0 ? (sign > 0 ? "+" : "−") : ""}
        {value}
      </div>
    </div>
  );
}
