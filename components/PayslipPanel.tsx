"use client";

import { useRef, useState } from "react";
import { Upload, Check, FileEdit, ArrowRight } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { createClient } from "@/lib/supabase/client";
import { isoFromDate } from "@/lib/period";
import { actualIncomeForPeriod, fortnightBreakdown, reconcileCategoryRows } from "@/lib/derive";
import { AUD } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, INK, FAV, UNFAV, NAVY, inputStyle } from "@/lib/theme";
import type { PayslipExtraction } from "@/lib/payslipSchema";
import type { Payslip } from "@/lib/types";

export default function PayslipPanel({ periodKey }: { periodKey: string }) {
  const { profile, payslips, addPayslip, updatePayslip, confirmPayslip, categories, balances, recurringExpenses, goals, miscIncome, periods, D, loggedByCat, reconciliations } = useAppData();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ payslipId: string; fields: PayslipExtraction } | null>(null);

  const periodPayslips = payslips.filter((p) => p.period_key === periodKey).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const confirmedPayslips = periodPayslips.filter((p) => p.status === "confirmed");
  const confirmedTotal = confirmedPayslips.reduce((s, p) => s + (p.net || 0), 0);

  // "Where this pay goes" — the fortnightly waterfall applied to everything actually confirmed
  // for this period so far (every confirmed payslip's net + misc income), not just this one payslip.
  const periodTotal = actualIncomeForPeriod(payslips, miscIncome, periodKey, profile.pay_anchor);
  const per = periods.find((p) => p.key === periodKey);
  // Only what's still unspent against the plan — money already spent (often via credit card,
  // which is already reflected in the `cc` balance paid down below) shouldn't be reserved twice.
  const rec = reconciliations[periodKey];
  const remainingCategoriesTotal = per
    ? reconcileCategoryRows(categories, D, per.year, loggedByCat[periodKey], rec?.actual_overrides ?? {}).reduce((s, r) => s + Math.max(0, r.plan - (r.actual ?? 0)), 0)
    : 0;
  const breakdown =
    per && periodTotal > 0
      ? fortnightBreakdown(remainingCategoriesTotal, balances, recurringExpenses, goals, periodTotal, Number(profile.emergency_target) || 0, isoFromDate(new Date()))
      : null;

  const handleFile = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${profile.user_id}/${periodKey}-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage.from("payslips").upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: row, error: insertErr } = await supabase
        .from("payslips")
        .insert({ user_id: profile.user_id, period_key: periodKey, file_path: path, status: "uploaded" })
        .select()
        .single();
      if (insertErr) throw insertErr;
      addPayslip(row);

      const res = await fetch("/api/payslips/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payslipId: row.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not extract figures from this payslip");

      updatePayslip(row.id, { status: "parsed", ...json.extracted });
      setReview({ payslipId: row.id, fields: json.extracted });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const setField = (key: keyof PayslipExtraction, value: number) => {
    setReview((r) => (r ? { ...r, fields: { ...r.fields, [key]: value } } : r));
  };

  const resumeReview = (p: Payslip) => {
    setReview({
      payslipId: p.id,
      fields: {
        gross: p.gross || 0,
        paygw_tax: p.paygw_tax || 0,
        super: p.super || 0,
        net: p.net || 0,
        help_hecs: p.help_hecs || 0,
        allowances: p.allowances,
        period_start: p.period_start,
        period_end: p.period_end,
      },
    });
  };

  const handleConfirm = async () => {
    if (!review) return;
    setBusy(true);
    try {
      await confirmPayslip(review.payslipId, periodKey, review.fields);
      setReview(null);
    } catch {
      setError("Could not save the confirmed payslip");
    } finally {
      setBusy(false);
    }
  };

  if (review) {
    const f = review.fields;
    const moneyField = (label: string, key: keyof PayslipExtraction) => (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "5px 0" }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4, width: 120 }}>
          <span style={{ color: MUTE, fontSize: 13 }}>$</span>
          <input
            type="number"
            inputMode="decimal"
            value={f[key] as number}
            onChange={(e) => setField(key, Number(e.target.value) || 0)}
            style={inputStyle}
          />
        </div>
      </div>
    );
    return (
      <div style={{ background: CARD, border: `1px solid ${GOLD}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
          Review extracted payslip
        </div>
        <div style={{ fontSize: 12, color: MUTE, marginBottom: 10 }}>
          Check these figures before confirming — nothing is posted until you confirm.
          {confirmedPayslips.length > 0 && " This adds on top of the pay already confirmed for this fortnight."}
        </div>
        {moneyField("Gross", "gross")}
        {moneyField("PAYG tax", "paygw_tax")}
        {moneyField("Super", "super")}
        {moneyField("Net (adds to this period's actual income)", "net")}
        {moneyField("HELP/HECS withheld", "help_hecs")}
        {f.allowances.length > 0 && (
          <div style={{ fontSize: 12, color: MUTE, marginTop: 8 }}>
            Allowances: {f.allowances.map((a) => `${a.label} ${AUD(a.amount)}`).join(", ")}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            onClick={handleConfirm}
            disabled={busy}
            style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: INK, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: "var(--font-space-grotesk), sans-serif" }}
          >
            <Check size={14} /> Confirm &amp; add to Everyday
          </button>
          <button
            onClick={() => setReview(null)}
            style={{ background: "transparent", color: MUTE, border: `1px solid ${LINE}`, borderRadius: 8, padding: "9px 15px", fontSize: 13, cursor: "pointer" }}
          >
            Discard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15 }}>
            Payslip{periodPayslips.length > 1 ? "s" : ""}
          </div>
          {periodPayslips.length === 0 && (
            <div style={{ fontSize: 12.5, color: MUTE, marginTop: 4 }}>
              Upload this fortnight&apos;s payslip (PDF or photo) to auto-fill net pay.
            </div>
          )}
        </div>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: INK, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1, fontFamily: "var(--font-space-grotesk), sans-serif" }}
        >
          <Upload size={14} /> {busy ? "Working…" : periodPayslips.length > 0 ? "Add another" : "Upload"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
      {periodPayslips.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}`, display: "flex", flexDirection: "column", gap: 8 }}>
          {periodPayslips.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
              {p.status === "confirmed" ? (
                <span style={{ display: "flex", alignItems: "center", gap: 5, color: FAV, fontWeight: 600 }}>
                  <Check size={13} /> Confirmed — net {AUD(p.net || 0)} added to Everyday
                </span>
              ) : p.status === "parsed" ? (
                <>
                  <span style={{ color: MUTE }}>Extracted — net {AUD(p.net || 0)}, not yet confirmed</span>
                  <button
                    onClick={() => resumeReview(p)}
                    style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: GOLD, fontWeight: 600, fontSize: 12, cursor: "pointer" }}
                  >
                    <FileEdit size={12} /> Review &amp; confirm
                  </button>
                </>
              ) : (
                <span style={{ color: MUTE }}>Uploaded — extracting…</span>
              )}
            </div>
          ))}
          {confirmedPayslips.length > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13, borderTop: `1px solid ${LINE}`, paddingTop: 8 }}>
              <span>Combined net this fortnight</span>
              <span>{AUD(confirmedTotal)}</span>
            </div>
          )}
        </div>
      )}
      {breakdown && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
            <ArrowRight size={13} color={GOLD} /> Where this pay goes
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            {breakdown.categoriesTotal > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: MUTE }}>Still to spend this fortnight (budget left)</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(breakdown.categoriesTotal)}</span>
              </div>
            )}
            {breakdown.sinkingTotal > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: MUTE }}>Set aside for bills</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(breakdown.sinkingTotal)}</span>
              </div>
            )}
            {breakdown.toCreditCard > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: UNFAV }}>→ Credit card</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: UNFAV }}>{AUD(breakdown.toCreditCard)}</span>
              </div>
            )}
            {breakdown.toEmergency > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: FAV }}>→ Emergency fund</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: FAV }}>{AUD(breakdown.toEmergency)}</span>
              </div>
            )}
            {breakdown.goalAllocations
              .filter((g) => g.amount > 0)
              .map((g) => (
                <div key={g.id} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: GOLD }}>→ {g.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: GOLD }}>{AUD(g.amount)}</span>
                </div>
              ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, borderTop: `1px solid ${LINE}`, paddingTop: 4, marginTop: 2 }}>
              <span style={{ color: NAVY }}>→ Deposit</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: FAV }}>{AUD(breakdown.toDeposit)}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>
            Based on {AUD(periodTotal)} confirmed so far this fortnight, against today&apos;s real balances — a guide for where to move the money, not automatic. &ldquo;Still to
            spend&rdquo; only counts what&apos;s left of the budget, not the full plan — anything already logged (e.g. on the credit card) is already reflected in what that card owes below.
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: "#C0492F", marginTop: 8 }}>{error}</div>}
    </div>
  );
}
