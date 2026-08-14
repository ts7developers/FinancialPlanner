"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { TrendingUp, Sparkles } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { useIsMobile } from "@/lib/useIsMobile";
import { isoFromDate } from "@/lib/period";
import { buildNetWorthProjection, netWorthPositiveAt, SALARY_SCENARIOS } from "@/lib/derive";
import { AUD } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, NAVY, FAV, selStyle } from "@/lib/theme";
import { Metric, Field } from "@/components/ui/atoms";
import ChartSkeleton from "@/components/charts/ChartSkeleton";
import type { NetWorthChartRow } from "@/components/charts/NetWorthChart";

const NetWorthChart = dynamic(() => import("@/components/charts/NetWorthChart"), { ssr: false, loading: () => <ChartSkeleton height={300} /> });

const HORIZON_PERIODS = 78; // roughly 3 years of fortnights

export default function SavingsTab() {
  const isMobile = useIsMobile();
  const { profile, balances, periods, D } = useAppData();
  const [growthPct, setGrowthPct] = useState("7");
  const [extraFn, setExtraFn] = useState("0");
  const [hecsIndexPct, setHecsIndexPct] = useState("3");
  const [scenarioId, setScenarioId] = useState("standard");

  const scenario = SALARY_SCENARIOS.find((s) => s.id === scenarioId) ?? SALARY_SCENARIOS[0];
  const comparisonScenario = SALARY_SCENARIOS.find((s) => s.id !== scenarioId) ?? SALARY_SCENARIOS[0];

  const today = isoFromDate(new Date());
  const points = buildNetWorthProjection(profile, D, balances, periods, today, Number(growthPct) || 0, Number(extraFn) || 0, scenario, Number(hecsIndexPct) || 0, HORIZON_PERIODS);
  const comparisonPoints = buildNetWorthProjection(
    profile,
    D,
    balances,
    periods,
    today,
    Number(growthPct) || 0,
    Number(extraFn) || 0,
    comparisonScenario,
    Number(hecsIndexPct) || 0,
    HORIZON_PERIODS
  );

  const chartRows: NetWorthChartRow[] = points.map((p, i) => ({
    label: p.label,
    liquid: p.liquid,
    invested: p.invested,
    netWorth: p.netWorth,
    netWorthComparison: comparisonPoints[i].netWorth,
  }));

  const in1yr = points[Math.min(25, points.length - 1)];
  const in3yr = points[points.length - 1];
  const positiveAt = netWorthPositiveAt(points);
  const netWorthToday = (balances.emergency || 0) + (balances.anzplus || 0) + (balances.shares || 0) + (balances.superb || 0) - (balances.cc || 0) - (balances.hecs || 0);
  const horizonYears = Math.round((HORIZON_PERIODS * 14) / 365);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Savings projection</div>
        <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>
          Where your planned surplus, super contributions and an assumed investment return put your net worth over the next few years.
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
          <Sparkles size={16} color={GOLD} /> Assumptions
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
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14 }}>
          <Field label="Investment growth (% p.a.)">
            <input type="number" inputMode="decimal" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} style={{ ...selStyle, width: 90, textAlign: "right" }} />
          </Field>
          <Field label="HECS indexation (% p.a.)">
            <input type="number" inputMode="decimal" value={hecsIndexPct} onChange={(e) => setHecsIndexPct(e.target.value)} style={{ ...selStyle, width: 90, textAlign: "right" }} />
          </Field>
          <Field label="Extra savings / fortnight">
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ color: MUTE, fontSize: 13 }}>$</span>
              <input type="number" inputMode="decimal" value={extraFn} onChange={(e) => setExtraFn(e.target.value)} style={{ ...selStyle, width: 90, textAlign: "right" }} />
            </div>
          </Field>
        </div>
        <div style={{ fontSize: 11, color: MUTE, marginTop: 10, lineHeight: 1.5 }}>
          &ldquo;Standard accountant progression&rdquo; compounds your package ~9% p.a. for the first 5 years (typical AU
          graduate-to-intermediate accountant growth, per SEEK/Hays salary guides) then ~3.5% p.a. after — a rough
          guide, not a guarantee. HECS reduces via the real compulsory-repayment schedule (marginal rates above
          $69,528 repayment income) and indexes at the rate above. Credit card is held flat. Shares and super compound
          at the investment-growth rate; super also keeps its usual employer contribution. Not financial advice.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Metric icon={TrendingUp} label="Net worth today" value={AUD(netWorthToday)} sub={netWorthToday < 0 ? "normal early on — it climbs" : "already positive"} />
        <Metric icon={TrendingUp} label="Projected in 1 year" value={AUD(in1yr.netWorth)} sub={`${AUD(in1yr.netWorth - netWorthToday)} change`} accent={FAV} />
        <Metric icon={TrendingUp} label={`Projected in ${horizonYears} years`} value={AUD(in3yr.netWorth)} sub={`${AUD(in3yr.netWorth - netWorthToday)} change`} accent={FAV} />
        <Metric
          icon={TrendingUp}
          label="Net worth turns positive"
          value={positiveAt ?? "—"}
          sub={positiveAt ? "at this rate" : `not within ${horizonYears} years`}
        />
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 18px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Net worth over time</div>
          <div style={{ fontSize: 12, color: MUTE }}>gold = {scenario.label.toLowerCase()} · dashed = {comparisonScenario.label.toLowerCase()}</div>
        </div>
        <NetWorthChart data={chartRows} comparisonLabel={comparisonScenario.label} isMobile={isMobile} />
        <div style={{ fontSize: 11.5, color: MUTE, padding: "2px 0 12px" }}>
          Starts from your current balances on <b style={{ color: NAVY }}>Accounts</b>, not the original plan baseline — so it reflects where you actually are today.
        </div>
      </div>
    </div>
  );
}
