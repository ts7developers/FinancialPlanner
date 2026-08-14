"use client";

import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, type TooltipValueType } from "recharts";
import { AUD } from "@/lib/money";
import { LINE, MUTE, GOLD, NAVY, FAV } from "@/lib/theme";
import type { BorrowingCapacityPoint } from "@/lib/derive";

export default function BorrowingCapacityChart({ data, loanNeeded }: { data: BorrowingCapacityPoint[]; loanNeeded: number }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 10, left: 6, bottom: 0 }}>
        <CartesianGrid stroke="#EFEBDD" vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={{ stroke: LINE }} />
        <YAxis tickFormatter={(v) => `$${v / 1000}k`} tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={false} width={48} />
        <Tooltip
          formatter={(v: TooltipValueType | undefined) => (v == null ? "—" : AUD(Number(v)))}
          contentStyle={{ borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 12, fontFamily: "Inter" }}
        />
        <ReferenceLine y={loanNeeded} stroke={GOLD} strokeDasharray="5 4" strokeWidth={1.5} />
        <Line type="monotone" dataKey="capLow" name="Capacity (low)" stroke={NAVY} strokeWidth={2} dot={{ r: 3 }} />
        <Line type="monotone" dataKey="capHigh" name="Capacity (high)" stroke={FAV} strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
