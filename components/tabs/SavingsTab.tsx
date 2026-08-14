"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { TrendingUp, Sparkles } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { useIsMobile } from "@/lib/useIsMobile";
import { isoFromDate } from "@/lib/period";
import { buildNetWorthProjection, netWorthPositiveAt } from "@/lib/derive";
import { AUD } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, NAVY, FAV, selStyle } from "@/lib/theme";
import { Metric, Field } from "@/components/ui/atoms";
import ChartSkeleton from "@/components/charts/ChartSkeleton";

const NetWorthChart = dynamic(() => import("@/components/charts/NetWorthChart"), { ssr: false, loading: () => <ChartSkeleton height={300} /> });

const HORIZON_PERIODS = 78; // roughly 3 years of fortnights

export default function SavingsTab() {
  const isMobile = useIsMobile();
  const { profile, balances, periods, D } = useAppData();
  const [growthPct, setGrowthPct] = useState("7");
  const [extraFn, setExtraFn] = useState("0");

  const today = isoFromDate(new Date());
  const points = buildNetWorthProjection(
    profile,
    D,
    balances,
    periods,
    today,
    Number(growthPct) || 0,
    Number(extraFn) || 0,
    HORIZON_PERIODS
  );

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
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
          <Field label="Investment growth (% p.a.)">
            <input type="number" inputMode="decimal" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} style={{ ...selStyle, width: 90, textAlign: "right" }} />
          </Field>
          <Field label="Extra savings / fortnight">
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ color: MUTE, fontSize: 13 }}>$</span>
              <input type="number" inputMode="decimal" value={extraFn} onChange={(e) => setExtraFn(e.target.value)} style={{ ...selStyle, width: 90, textAlign: "right" }} />
            </div>
          </Field>
        </div>
        <div style={{ fontSize: 11, color: MUTE, marginTop: 10, lineHeight: 1.5 }}>
          Shares and super compound at the rate above; super also keeps getting its usual employer contribution. Credit
          card and HECS are held flat — no repayment or indexation schedule modelled. A rough guide only, not
          financial advice.
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
          <div style={{ fontSize: 12, color: MUTE }}>gold line = net worth · shaded = cash vs invested</div>
        </div>
        <NetWorthChart data={points} isMobile={isMobile} />
        <div style={{ fontSize: 11.5, color: MUTE, padding: "2px 0 12px" }}>
          Starts from your current balances on <b style={{ color: NAVY }}>Accounts</b>, not the original plan baseline — so it reflects where you actually are today.
        </div>
      </div>
    </div>
  );
}
