"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, type TooltipValueType } from "recharts";
import { AUD } from "@/lib/money";
import { LINE, MUTE, GOLD, chartTooltipStyle } from "@/lib/theme";

export interface IncomeTrendPoint {
  label: string;
  gross: number;
  net: number;
}

export default function IncomeTrendChart({ data }: { data: IncomeTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 10, left: 6, bottom: 0 }} barGap={4}>
        <CartesianGrid stroke="#EFEBDD" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={{ stroke: LINE }} />
        <YAxis tickFormatter={(v) => `$${v / 1000}k`} tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={false} width={44} />
        <Tooltip formatter={(v: TooltipValueType | undefined) => AUD(Number(v))} contentStyle={chartTooltipStyle} cursor={{ fill: "#F4EFE1" }} />
        <Bar dataKey="gross" name="Gross" fill={LINE} radius={[4, 4, 0, 0]} animationDuration={500} />
        <Bar dataKey="net" name="Net" fill={GOLD} radius={[4, 4, 0, 0]} animationDuration={500} />
      </BarChart>
    </ResponsiveContainer>
  );
}
