"use client";

import React from "react";
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  type TooltipValueType,
} from "recharts";
import { Wallet, PiggyBank, Home, TrendingUp, Receipt, ScrollText, Camera } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { useIsMobile } from "@/lib/useIsMobile";
import { currentPeriod, isoFromDate } from "@/lib/period";
import { buildPieData } from "@/lib/derive";
import { AUD, num } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, NAVY, FAV, PIE_COLORS } from "@/lib/theme";
import { Metric, Progress } from "@/components/ui/atoms";
import Link from "next/link";

export default function OverviewTab() {
  const isMobile = useIsMobile();
  const { profile, categories, balances, planPath, snapshots, periods, D } = useAppData();

  const today = isoFromDate(new Date());
  const yr = currentPeriod(periods, today).year;

  const chartData = planPath.map((p) => {
    const s = snapshots.find((x) => x.period_key === p.key);
    return { ...p, actualDeposit: s ? s.deposit : null };
  });

  const pieData = buildPieData(categories, D, yr);
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const steps: [string, string, string, typeof Receipt][] = [
    ["Log", "/expenses", "each purchase as it happens", Receipt],
    ["Close", "/reconcile", "actual vs plan each payday", ScrollText],
    ["Track", "/accounts", "snapshot balances to plot", Camera],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          background: CARD,
          border: `1px solid ${LINE}`,
          borderRadius: 14,
          padding: isMobile ? "12px 14px" : "12px 18px",
          alignItems: "center",
        }}
      >
        {steps.map(([step, href, desc, Icon], i) => (
          <React.Fragment key={step}>
            <Link
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: 2,
                textAlign: "left",
                flex: isMobile ? "1 1 100%" : "0 1 auto",
              }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 8, background: "#F1ECDD", color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={16} />
              </span>
              <span>
                <span style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: MUTE, display: "block" }}>
                  {i + 1} · {step}
                </span>
                <span style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 13.5, color: NAVY, textTransform: "capitalize" }}>
                  {href.slice(1)}
                </span>{" "}
                <span style={{ fontSize: 12, color: MUTE }}>— {desc}</span>
              </span>
            </Link>
            {!isMobile && i < 2 && <span style={{ color: LINE, fontSize: 18 }}>→</span>}
          </React.Fragment>
        ))}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Metric icon={Wallet} label="Net pay / fortnight" value={AUD(D.netFTfn)} sub="full-time, after tax & HECS" />
        <Metric icon={TrendingUp} label="Planned surplus / fn" value={AUD(D.netFTfn - D.expFN(2027))} sub="2027+, all costs running" />
        <Metric icon={PiggyBank} label="Emergency fund" value={AUD(num(balances.emergency))} sub={`target ${AUD(profile.emergency_target)}`} accent={FAV} />
        <Metric icon={Home} label="Deposit saved" value={AUD(num(balances.anzplus))} sub={`5% goal ${AUD(D.dep5)}`} />
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 18px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Road to the deposit</div>
          <div style={{ fontSize: 12, color: MUTE }}>gold line = 5% goal · dots = your snapshots</div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 10, left: 6, bottom: 0 }}>
            <CartesianGrid stroke="#EFEBDD" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTE }} interval={isMobile ? 12 : 7} tickLine={false} axisLine={{ stroke: LINE }} />
            <YAxis tickFormatter={(v) => `$${v / 1000}k`} tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              formatter={(v: TooltipValueType | undefined) => (v == null ? "—" : AUD(Number(v)))}
              contentStyle={{ borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 12, fontFamily: "Inter" }}
            />
            <ReferenceLine y={D.dep5} stroke={GOLD} strokeDasharray="5 4" strokeWidth={1.5} />
            <Line type="monotone" dataKey="planDeposit" name="Planned deposit" stroke={NAVY} strokeWidth={2.4} dot={false} />
            <Scatter dataKey="actualDeposit" name="Actual" fill={FAV} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, flex: "1 1 320px" }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Where the money goes</div>
          <div style={{ fontSize: 11.5, color: MUTE, marginTop: -4, marginBottom: 6 }}>per fortnight</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={48} outerRadius={80} paddingAngle={1} stroke="none">
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: TooltipValueType | undefined) => AUD(Number(v))} contentStyle={{ borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, minWidth: 150, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 10px" }}>
              {pieData.map((d, i) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MUTE }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                  {d.name} <span style={{ marginLeft: "auto", color: NAVY, fontVariantNumeric: "tabular-nums" }}>{pieTotal > 0 ? ((d.value / pieTotal) * 100).toFixed(0) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Goal progress</div>
          <Progress label="Emergency fund" value={num(balances.emergency)} target={num(profile.emergency_target)} colorFrom={FAV} />
          <Progress label="House deposit (5%)" value={num(balances.anzplus)} target={D.dep5} />
          <div style={{ fontSize: 11.5, color: MUTE, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
            Edit the baseline on <b style={{ color: NAVY }}>Plan</b>; log balances on <b style={{ color: NAVY }}>Accounts</b> and hit <b style={{ color: NAVY }}>Snapshot</b> to plot a dot.
          </div>
        </div>
      </div>
    </div>
  );
}
