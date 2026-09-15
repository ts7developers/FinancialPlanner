"use client";

import { useState } from "react";
import { ArrowRight, Wallet } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { useFortnightBreakdown } from "@/components/useFortnightBreakdown";
import { currentPeriod, dateFromISO, dayLabel, isoFromDate, periodLabel } from "@/lib/period";
import { EMERGENCY_ALLOCATION_ID, DEPOSIT_ALLOCATION_ID, paydayForPeriod } from "@/lib/derive";
import { AUD } from "@/lib/money";
import { LINE, MUTE, GOLD, FAV, UNFAV, NAVY, selStyle } from "@/lib/theme";
import { Panel } from "@/components/ui/atoms";
import PayPriorityPanel from "@/components/PayPriorityPanel";

export default function PaySplitTab() {
  const { periods, profile } = useAppData();
  const [periodKey, setPeriodKey] = useState(() => currentPeriod(periods, isoFromDate(new Date())).key);
  const { breakdown, isPlanned } = useFortnightBreakdown(periodKey, { fallbackToPlanned: true });
  const per = periods.find((p) => p.key === periodKey);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Pay split</div>
        <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>Where each fortnight&apos;s pay goes, updated live as balances and spending change.</div>
      </div>

      <Panel title="This fortnight" icon={Wallet}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <select value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} style={{ ...selStyle, width: 220 }}>
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {periodLabel(p)} · paid {dayLabel(dateFromISO(paydayForPeriod(p, profile.payday_offset_days ?? 2)))}
              </option>
            ))}
          </select>
          {isPlanned && breakdown && <span style={{ fontSize: 11.5, color: MUTE }}>based on planned pay — no payslip confirmed yet this fortnight</span>}
        </div>

        {!breakdown && (
          <div style={{ fontSize: 12.5, color: MUTE }}>
            {per ? "No pay to split for this fortnight yet." : "Pick a fortnight to see its split."}
          </div>
        )}

        {breakdown && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: `1px solid ${LINE}`, marginBottom: 4 }}>
              <span style={{ color: MUTE }}>{isPlanned ? "Planned net pay" : "Confirmed net pay"}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{AUD(breakdown.netPay)}</span>
            </div>
            {breakdown.toCreditCard > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: UNFAV, display: "flex", alignItems: "center", gap: 5 }}>
                  <ArrowRight size={13} /> Credit card (always first)
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: UNFAV }}>{AUD(breakdown.toCreditCard)}</span>
              </div>
            )}
            {breakdown.categoriesTotal > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: MUTE }}>Still to spend this fortnight (budget left)</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(breakdown.categoriesTotal)}</span>
              </div>
            )}
            {breakdown.sinkingTotal > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: MUTE }}>Set aside for bills</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(breakdown.sinkingTotal)}</span>
              </div>
            )}
            {breakdown.orderedAllocations
              .filter((a) => a.amount > 0)
              .map((a) => {
                const color = a.id === DEPOSIT_ALLOCATION_ID ? NAVY : a.id === EMERGENCY_ALLOCATION_ID ? FAV : GOLD;
                const amountColor = a.id === DEPOSIT_ALLOCATION_ID ? FAV : color;
                return (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color, display: "flex", alignItems: "center", gap: 5 }}>
                      <ArrowRight size={13} /> {a.label}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: amountColor }}>{AUD(a.amount)}</span>
                  </div>
                );
              })}
          </div>
        )}
        <div style={{ fontSize: 11, color: MUTE, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}`, lineHeight: 1.5 }}>
          Credit card paydown is always first, fixed, ahead of everything below it — every expense on the card gets cleared before anything else moves. What&apos;s left after that
          splits by the percentages set below, against real balances as they stood when this fortnight&apos;s pay first landed. A guide for where to move the money, not automatic.
        </div>
      </Panel>

      <PayPriorityPanel />
    </div>
  );
}
