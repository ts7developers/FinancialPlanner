"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, type TooltipValueType } from "recharts";
import { AUD, AUDAxis } from "@/lib/money";
import { LINE, MUTE, GOLD, NAVY, FAV, UNFAV, chartTooltipStyle } from "@/lib/theme";
import type { BalanceHistoryPoint } from "@/lib/derive";

export default function BalanceHistoryChart({ data, isMobile }: { data: BalanceHistoryPoint[]; isMobile: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 10, left: 6, bottom: 0 }}>
        <CartesianGrid stroke="#EFEBDD" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTE }} interval={isMobile ? 1 : 0} tickLine={false} axisLine={{ stroke: LINE }} />
        <YAxis tickFormatter={AUDAxis} tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={false} width={48} />
        <Tooltip formatter={(v: TooltipValueType | undefined) => (v == null ? "—" : AUD(Number(v)))} contentStyle={chartTooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="deposit" name="Deposit (ANZ Plus)" stroke={NAVY} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} animationDuration={600} />
        <Line type="monotone" dataKey="emergency" name="Emergency fund" stroke={FAV} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} animationDuration={600} />
        <Line type="monotone" dataKey="creditCard" name="Credit card owing" stroke={UNFAV} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} animationDuration={600} />
        <Line type="monotone" dataKey="hecs" name="HECS owing" stroke={GOLD} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} animationDuration={600} />
      </LineChart>
    </ResponsiveContainer>
  );
}
