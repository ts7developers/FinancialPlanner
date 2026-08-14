"use client";

import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, type TooltipValueType } from "recharts";
import { AUD } from "@/lib/money";
import { LINE, MUTE, GOLD, NAVY, FAV, chartTooltipStyle } from "@/lib/theme";

export interface NetWorthChartRow {
  label: string;
  liquid: number;
  invested: number;
  netWorth: number;
  netWorthComparison: number;
}

export default function NetWorthChart({
  data,
  comparisonLabel,
  isMobile,
}: {
  data: NetWorthChartRow[];
  comparisonLabel: string;
  isMobile: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 10, left: 6, bottom: 0 }}>
        <defs>
          <linearGradient id="liquidFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={NAVY} stopOpacity={0.5} />
            <stop offset="100%" stopColor={NAVY} stopOpacity={0.15} />
          </linearGradient>
          <linearGradient id="investedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={FAV} stopOpacity={0.55} />
            <stop offset="100%" stopColor={FAV} stopOpacity={0.15} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#EFEBDD" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTE }} interval={isMobile ? 9 : 4} tickLine={false} axisLine={{ stroke: LINE }} />
        <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={false} width={48} />
        <Tooltip formatter={(v: TooltipValueType | undefined) => (v == null ? "—" : AUD(Number(v)))} contentStyle={chartTooltipStyle} />
        <ReferenceLine y={0} stroke={MUTE} strokeDasharray="3 3" strokeWidth={1} />
        <Area type="monotone" dataKey="liquid" stackId="assets" name="Cash (emergency + deposit)" stroke={NAVY} strokeWidth={1.5} fill="url(#liquidFill)" animationDuration={700} />
        <Area type="monotone" dataKey="invested" stackId="assets" name="Invested (shares + super)" stroke={FAV} strokeWidth={1.5} fill="url(#investedFill)" animationDuration={700} />
        <Line
          type="monotone"
          dataKey="netWorthComparison"
          name={comparisonLabel}
          stroke={MUTE}
          strokeWidth={1.8}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 4, fill: MUTE, stroke: "#fff", strokeWidth: 2 }}
          animationDuration={700}
        />
        <Line
          type="monotone"
          dataKey="netWorth"
          name="Net worth"
          stroke={GOLD}
          strokeWidth={2.6}
          dot={false}
          activeDot={{ r: 5, fill: GOLD, stroke: "#fff", strokeWidth: 2 }}
          animationDuration={700}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
