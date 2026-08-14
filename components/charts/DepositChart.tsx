"use client";

import { ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, type TooltipValueType } from "recharts";
import { AUD } from "@/lib/money";
import { LINE, MUTE, GOLD, NAVY, FAV } from "@/lib/theme";
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
        <CartesianGrid stroke="#EFEBDD" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTE }} interval={isMobile ? 12 : 7} tickLine={false} axisLine={{ stroke: LINE }} />
        <YAxis tickFormatter={(v) => `$${v / 1000}k`} tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          formatter={(v: TooltipValueType | undefined) => (v == null ? "—" : AUD(Number(v)))}
          contentStyle={{ borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 12, fontFamily: "Inter" }}
        />
        <ReferenceLine y={goal} stroke={GOLD} strokeDasharray="5 4" strokeWidth={1.5} />
        <Line type="monotone" dataKey="planDeposit" name="Planned deposit" stroke={NAVY} strokeWidth={2.4} dot={false} />
        <Scatter dataKey="actualDeposit" name="Actual" fill={FAV} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
