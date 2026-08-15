"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, type TooltipValueType } from "recharts";
import { AUD, AUDAxis } from "@/lib/money";
import { LINE, MUTE, FAV, UNFAV, chartTooltipStyle } from "@/lib/theme";
import type { SpendTrendPoint } from "@/lib/derive";

export default function SpendingTrendChart({ data }: { data: SpendTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 10, left: 6, bottom: 0 }} barGap={4}>
        <CartesianGrid stroke="#EFEBDD" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={{ stroke: LINE }} />
        <YAxis tickFormatter={AUDAxis} tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          formatter={(v: TooltipValueType | undefined) => (v == null ? "not reconciled" : AUD(Number(v)))}
          contentStyle={chartTooltipStyle}
          cursor={{ fill: "#F4EFE1" }}
        />
        <Bar dataKey="planned" name="Planned" fill={LINE} radius={[4, 4, 0, 0]} animationDuration={500} />
        <Bar dataKey="actual" name="Actual" radius={[4, 4, 0, 0]} animationDuration={500}>
          {data.map((d, i) => (
            // The in-progress fortnight's "actual" is partial (still being logged) — comparing
            // it against a full fortnight's plan isn't a fair favourable/unfavourable call yet.
            <Cell key={i} fill={d.actual == null ? "#EFEBDD" : d.isCurrent ? MUTE : d.actual <= d.planned ? FAV : UNFAV} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
