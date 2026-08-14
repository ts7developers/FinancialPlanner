"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, type TooltipValueType } from "recharts";
import { AUD } from "@/lib/money";
import { LINE, MUTE, GOLD, NAVY, chartTooltipStyle } from "@/lib/theme";
import type { ActualSpendPoint } from "@/lib/derive";

export default function ActualSpendTrendChart({ data, average }: { data: ActualSpendPoint[]; average: number }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 10, left: 6, bottom: 0 }}>
        <CartesianGrid stroke="#EFEBDD" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={{ stroke: LINE }} />
        <YAxis tickFormatter={(v) => `$${v / 1000}k`} tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={false} width={44} />
        <Tooltip formatter={(v: TooltipValueType | undefined) => AUD(Number(v))} contentStyle={chartTooltipStyle} cursor={{ fill: "#F4EFE1" }} />
        <ReferenceLine y={average} stroke={GOLD} strokeDasharray="5 4" strokeWidth={1.5} />
        <Bar dataKey="total" name="Spent" fill={NAVY} radius={[4, 4, 0, 0]} animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}
