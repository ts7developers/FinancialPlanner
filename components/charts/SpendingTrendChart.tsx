"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, type TooltipValueType } from "recharts";
import { AUD } from "@/lib/money";
import { LINE, MUTE, FAV, UNFAV } from "@/lib/theme";
import type { SpendTrendPoint } from "@/lib/derive";

export default function SpendingTrendChart({ data }: { data: SpendTrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 10, left: 6, bottom: 0 }}>
        <CartesianGrid stroke="#EFEBDD" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={{ stroke: LINE }} />
        <YAxis tickFormatter={(v) => `$${v / 1000}k`} tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          formatter={(v: TooltipValueType | undefined) => (v == null ? "not reconciled" : AUD(Number(v)))}
          contentStyle={{ borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 12, fontFamily: "Inter" }}
        />
        <Bar dataKey="planned" name="Planned" fill={LINE} radius={[4, 4, 0, 0]} />
        <Bar dataKey="actual" name="Actual" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.actual == null ? "#EFEBDD" : d.actual <= d.planned ? FAV : UNFAV} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
