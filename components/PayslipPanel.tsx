"use client";

import { useRef, useState } from "react";
import { Upload, Check } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { createClient } from "@/lib/supabase/client";
import { AUD } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, INK, FAV, inputStyle } from "@/lib/theme";
import type { PayslipExtraction } from "@/lib/payslipSchema";

export default function PayslipPanel({ periodKey }: { periodKey: string }) {
  const { profile, payslips, addPayslip, updatePayslip, confirmPayslip } = useAppData();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<{ payslipId: string; fields: PayslipExtraction } | null>(null);

  const existing = payslips.find((p) => p.period_key === periodKey);

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

  const handleConfirm = async () => {
    if (!review) return;
    setBusy(true);
    try {
      await confirmPayslip(review.payslipId, periodKey, review.fields.net);
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
        </div>
        {moneyField("Gross", "gross")}
        {moneyField("PAYG tax", "paygw_tax")}
        {moneyField("Super", "super")}
        {moneyField("Net (posts as this period's actual income)", "net")}
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
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15 }}>Payslip</div>
          {existing?.status === "confirmed" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: FAV, fontWeight: 600, marginTop: 4 }}>
              <Check size={13} /> Confirmed — net {AUD(existing.net || 0)} posted to this fortnight and added to Everyday
            </div>
          ) : (
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
          <Upload size={14} /> {busy ? "Working…" : existing ? "Replace" : "Upload"}
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
      {error && <div style={{ fontSize: 12, color: "#C0492F", marginTop: 8 }}>{error}</div>}
    </div>
  );
}
