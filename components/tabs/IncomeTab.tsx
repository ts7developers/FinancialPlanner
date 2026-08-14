"use client";

import dynamic from "next/dynamic";
import { Wallet, Landmark, PiggyBank, TrendingUp, Receipt } from "lucide-react";
import Link from "next/link";
import { useAppData } from "@/components/AppDataProvider";
import { financialYearStart, isoFromDate, periodKeyOf, periodLabel } from "@/lib/period";
import { sumYTD } from "@/lib/derive";
import { AUD } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, NAVY, FAV } from "@/lib/theme";
import { Metric } from "@/components/ui/atoms";
import ChartSkeleton from "@/components/charts/ChartSkeleton";
import type { IncomeTrendPoint } from "@/components/charts/IncomeTrendChart";

const IncomeTrendChart = dynamic(() => import("@/components/charts/IncomeTrendChart"), { ssr: false, loading: () => <ChartSkeleton height={220} /> });

const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  parsed: "Needs review",
  confirmed: "Confirmed",
};

export default function IncomeTab() {
  const { profile, payslips, periods } = useAppData();

  const today = isoFromDate(new Date());
  const ytd = sumYTD(payslips, financialYearStart(today));
  const confirmed = payslips.filter((p) => p.status === "confirmed").sort((a, b) => (a.period_key || "").localeCompare(b.period_key || ""));
  const avgNet = confirmed.length > 0 ? ytd.net / confirmed.length : 0;

  const trend: IncomeTrendPoint[] = confirmed.slice(-13).map((p) => {
    const per = periods.find((x) => x.key === p.period_key);
    return { label: per ? periodLabel(per) : (p.period_key || "").slice(5), gross: p.gross || 0, net: p.net || 0 };
  });

  const history = payslips.slice().sort((a, b) => (b.period_key || "").localeCompare(a.period_key || ""));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Income</div>
        <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>
          Every confirmed payslip, year-to-date totals, and how gross vs net has tracked over time.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Metric icon={Wallet} label="Gross (FY YTD)" value={AUD(ytd.gross)} sub="from confirmed payslips" />
        <Metric icon={Landmark} label="PAYG tax (FY YTD)" value={AUD(ytd.paygwTax + (Number(profile.tax_paid_opening) || 0))} sub={profile.tax_paid_opening > 0 ? `incl. ${AUD(profile.tax_paid_opening)} opening` : undefined} />
        <Metric icon={PiggyBank} label="Super (FY YTD)" value={AUD(ytd.super)} sub="employer contributions" accent={FAV} />
        <Metric icon={TrendingUp} label="Net (FY YTD)" value={AUD(ytd.net)} sub={`avg ${AUD(avgNet, 2)} / pay`} accent={FAV} />
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 18px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Gross vs net</div>
          <div style={{ fontSize: 12, color: MUTE }}>last {trend.length} confirmed pays</div>
        </div>
        {trend.length === 0 ? (
          <div style={{ padding: "24px 0 32px", fontSize: 13, color: MUTE, textAlign: "center" }}>
            No confirmed payslips yet — upload one from <Link href="/reconcile" style={{ color: NAVY, fontWeight: 600 }}>Reconcile</Link> to start tracking income here.
          </div>
        ) : (
          <IncomeTrendChart data={trend} />
        )}
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "14px 18px", borderBottom: `1px solid ${LINE}` }}>
          <Receipt size={16} color={GOLD} />
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Payslip history</div>
        </div>
        {history.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: MUTE, textAlign: "center" }}>
            Nothing uploaded yet. Upload a payslip for any fortnight from <Link href="/reconcile" style={{ color: NAVY, fontWeight: 600 }}>Reconcile</Link>.
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 100px 100px 100px 100px 1fr", padding: "7px 18px", fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>
              <span>Fortnight</span>
              <span style={{ textAlign: "right" }}>Gross</span>
              <span style={{ textAlign: "right" }}>Tax</span>
              <span style={{ textAlign: "right" }}>Super</span>
              <span style={{ textAlign: "right" }}>Net</span>
              <span style={{ textAlign: "right" }}>Status</span>
            </div>
            {history.map((p) => {
              const per = periods.find((x) => x.key === p.period_key);
              return (
                <Link
                  key={p.id}
                  href={`/reconcile?period=${p.period_key}`}
                  className="ledger-row"
                  style={{ display: "grid", gridTemplateColumns: "1.2fr 100px 100px 100px 100px 1fr", alignItems: "center", padding: "8px 18px", borderTop: `1px solid ${LINE}`, fontSize: 13, textDecoration: "none", color: NAVY }}
                >
                  <span>{per ? periodLabel(per) : p.period_key}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTE }}>{p.gross != null ? AUD(p.gross) : "—"}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTE }}>{p.paygw_tax != null ? AUD(p.paygw_tax) : "—"}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTE }}>{p.super != null ? AUD(p.super) : "—"}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{p.net != null ? AUD(p.net) : "—"}</span>
                  <span style={{ textAlign: "right", fontSize: 11.5, color: p.status === "confirmed" ? FAV : MUTE, fontWeight: 600 }}>{STATUS_LABEL[p.status] || p.status}</span>
                </Link>
              );
            })}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: MUTE, padding: "10px 18px 14px" }}>
          Upload and confirm payslips from <b style={{ color: NAVY }}>Reconcile</b> — each one auto-fills that fortnight&apos;s actual income and lands the net pay in your Everyday balance. This page is the read-only ledger and trend.
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: MUTE }}>
        {periodKeyOf(today, profile.pay_anchor) === null && (
          <>Today falls before your pay cycle starts (see <b style={{ color: NAVY }}>Plan</b>) — YTD figures above only include payslips within tracked fortnights.</>
        )}
      </div>
    </div>
  );
}
