"use client";

import { ComposedChart, Area, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, type TooltipValueType } from "recharts";
import { AUD } from "@/lib/money";
import { LINE, MUTE, GOLD, NAVY, FAV, chartTooltipStyle } from "@/lib/theme";
import type { PlanPathPoint } from "@/lib/derive";

export default function DepositChart({
  data,
  goal,
  isMobile,
}: {
  data: (PlanPathPoint & { actualDeposit: number | null })[];
  goal: number;
  isMobile: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 10, left: 6, bottom: 0 }}>
        <defs>
          <linearGradient id="depositFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={NAVY} stopOpacity={0.22} />
            <stop offset="100%" stopColor={NAVY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#EFEBDD" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTE }} interval={isMobile ? 12 : 7} tickLine={false} axisLine={{ stroke: LINE }} />
        <YAxis tickFormatter={(v) => `$${v / 1000}k`} tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={false} width={44} />
        <Tooltip formatter={(v: TooltipValueType | undefined) => (v == null ? "—" : AUD(Number(v)))} contentStyle={chartTooltipStyle} />
        <ReferenceLine y={goal} stroke={GOLD} strokeDasharray="5 4" strokeWidth={1.5} />
        <Area
          type="monotone"
          dataKey="planDeposit"
          name="Planned deposit"
          stroke={NAVY}
          strokeWidth={2.4}
          fill="url(#depositFill)"
          dot={false}
          activeDot={{ r: 4, fill: NAVY, stroke: "#fff", strokeWidth: 2 }}
          animationDuration={600}
        />
        <Scatter dataKey="actualDeposit" name="Actual" fill={FAV} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
