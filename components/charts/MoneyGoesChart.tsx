"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, type TooltipValueType } from "recharts";
import { AUD } from "@/lib/money";
import { LINE, PIE_COLORS } from "@/lib/theme";
import type { PieSlice } from "@/lib/derive";

export default function MoneyGoesChart({ data }: { data: PieSlice[] }) {
  return (
    <ResponsiveContainer width={180} height={180}>
      <PieChart>
        <Pie data={data} dataKey="value" innerRadius={48} outerRadius={80} paddingAngle={1} stroke="none">
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: TooltipValueType | undefined) => AUD(Number(v))} contentStyle={{ borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
