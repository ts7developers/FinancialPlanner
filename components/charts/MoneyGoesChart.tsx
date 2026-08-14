"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, type TooltipValueType } from "recharts";
import { AUD } from "@/lib/money";
import { PIE_COLORS, chartTooltipStyle } from "@/lib/theme";
import type { PieSlice } from "@/lib/derive";

export default function MoneyGoesChart({ data, size = 180 }: { data: PieSlice[]; size?: number }) {
  return (
    <ResponsiveContainer width={size} height={size}>
      <PieChart>
        <Pie data={data} dataKey="value" innerRadius={size * 0.267} outerRadius={size * 0.444} paddingAngle={1} stroke="none" animationDuration={500}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: TooltipValueType | undefined) => AUD(Number(v))} contentStyle={chartTooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}
