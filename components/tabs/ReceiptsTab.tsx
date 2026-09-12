"use client";

import { useRef, useState } from "react";
import { Upload, Trash2, ExternalLink, Plus, FileText, Receipt as ReceiptIcon } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { useToast } from "@/components/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { isoFromDate, financialYearStart } from "@/lib/period";
import { DEDUCTION_CATEGORIES, DEDUCTION_CATEGORY_LABELS, receiptsForFinancialYear, receiptTotalsByCategory } from "@/lib/receipts";
import { AUD } from "@/lib/money";
import { LINE, MUTE, MUTE_ICON, GOLD, ON_ACCENT_DARK, NAVY, FAV, UNFAV, SURFACE_SUBTLE, selStyle } from "@/lib/theme";
import { Panel, Field, Metric } from "@/components/ui/atoms";
import type { DeductionCategory } from "@/lib/types";

function fyStartFor(offset: number, thisFYStart: string): string {
  return `${Number(thisFYStart.slice(0, 4)) + offset}-07-01`;
}

function fyLabel(fyStartISO: string): string {
  const startYear = Number(fyStartISO.slice(0, 4));
  return `FY ${startYear}–${String(startYear + 1).slice(2)}`;
}

export default function ReceiptsTab() {
  const { profile, receipts, transactions, addReceipt, deleteReceipt, undoDeleteReceipt } = useAppData();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const today = isoFromDate(new Date());
  const thisFYStart = financialYearStart(today);
  const [fyStart, setFyStart] = useState(thisFYStart);

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<DeductionCategory>("other");
  const [transactionId, setTransactionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fyReceipts = receiptsForFinancialYear(receipts, fyStart);
  const fyTotal = fyReceipts.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalsByCategory = receiptTotalsByCategory(fyReceipts);

  const taggedTransactionIds = new Set(receipts.filter((r) => r.transaction_id).map((r) => r.transaction_id));
  const taggableTransactions = transactions.filter((t) => !taggedTransactionIds.has(t.id)).slice(0, 150);
  const selectedTxn = transactions.find((t) => t.id === transactionId);

  const resetForm = () => {
    setDescription("");
    setAmount("");
    setCategory("other");
    setTransactionId("");
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const onSubmit = async () => {
    setError("");
    const finalDate = mode === "existing" ? selectedTxn?.date : date;
    const finalDescription = mode === "existing" ? selectedTxn?.description || "Expense" : description.trim();
    const finalAmount = mode === "existing" ? Number(selectedTxn?.amount) : Number(amount);
    if (mode === "existing" && !selectedTxn) {
      setError("Pick an expense to tag as deductible");
      return;
    }
    if (!finalDate || !(finalAmount > 0)) {
      setError("Add a date and amount");
      return;
    }
    setBusy(true);
    try {
      let filePath: string | null = null;
      if (file) {
        const supabase = createClient();
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${profile.user_id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from("receipts").upload(path, file);
        if (uploadErr) throw uploadErr;
        filePath = path;
      }
      await addReceipt(finalDate, finalDescription, finalAmount, category, filePath, mode === "existing" ? transactionId : null);
      resetForm();
      toast("Receipt logged");
    } catch {
      setError("Could not log that — try again");
    } finally {
      setBusy(false);
    }
  };

  const onViewReceipt = async (filePath: string) => {
    const supabase = createClient();
    const { data, error: signErr } = await supabase.storage.from("receipts").createSignedUrl(filePath, 3600);
    if (signErr || !data) {
      toast("Could not open that receipt — try again");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const onDelete = (id: string, label: string) => {
    deleteReceipt(id, () => toast("Could not remove that — it's back"));
    toast(`Removed "${label}"`, { actionLabel: "Undo", onAction: () => undoDeleteReceipt(id) });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Receipts</div>
        <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>
          Anything that could be tax-deductible — tag something already logged on Expenses, or log a work-related purchase that isn&apos;t a regular household expense. A tracker for
          your own records, not tax advice — check with your accountant or the ATO on what actually qualifies.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Metric icon={ReceiptIcon} label={`Deductible (${fyLabel(fyStart)})`} value={AUD(fyTotal)} sub={`${fyReceipts.length} item${fyReceipts.length === 1 ? "" : "s"}`} accent={FAV} />
        {totalsByCategory.slice(0, 3).map((t) => (
          <Metric key={t.category} icon={FileText} label={DEDUCTION_CATEGORY_LABELS[t.category]} value={AUD(t.total)} sub={`${t.count} item${t.count === 1 ? "" : "s"}`} />
        ))}
      </div>

      <Panel title="Log a deductible item" icon={Plus}>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <button
            onClick={() => setMode("new")}
            style={{ background: mode === "new" ? GOLD : SURFACE_SUBTLE, color: mode === "new" ? ON_ACCENT_DARK : NAVY, border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            New item
          </button>
          <button
            onClick={() => setMode("existing")}
            style={{ background: mode === "existing" ? GOLD : SURFACE_SUBTLE, color: mode === "existing" ? ON_ACCENT_DARK : NAVY, border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            Tag an existing expense
          </button>
        </div>

        {mode === "existing" ? (
          <Field label="Expense">
            <select value={transactionId} onChange={(e) => setTransactionId(e.target.value)} style={{ ...selStyle, width: "100%", textAlign: "left" }}>
              <option value="">Pick an expense…</option>
              {taggableTransactions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.date} · {t.description || t.category_key} · {AUD(Number(t.amount) || 0)}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...selStyle, width: 150 }} />
            </Field>
            <Field label="Description">
              <input type="text" placeholder="e.g. Steel-cap boots" value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...selStyle, width: 200, textAlign: "left" }} />
            </Field>
            <Field label="Amount">
              <input type="number" inputMode="decimal" placeholder="$" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...selStyle, width: 100 }} />
            </Field>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
          <Field label="Deduction category">
            <select value={category} onChange={(e) => setCategory(e.target.value as DeductionCategory)} style={{ ...selStyle, width: 220, textAlign: "left" }}>
              {DEDUCTION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DEDUCTION_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <button
            onClick={() => fileInput.current?.click()}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: NAVY, border: `1px solid ${LINE}`, borderRadius: 8, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", height: 36 }}
          >
            <Upload size={14} /> {file ? file.name.slice(0, 22) : "Attach receipt"}
          </button>
          <input ref={fileInput} type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button
            onClick={onSubmit}
            disabled={busy}
            style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: ON_ACCENT_DARK, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: "var(--font-space-grotesk), sans-serif", height: 36 }}
          >
            <Plus size={14} /> {busy ? "Saving…" : "Log it"}
          </button>
        </div>
        {error && <div style={{ fontSize: 12, color: UNFAV, marginTop: 8 }}>{error}</div>}
      </Panel>

      <Panel title="All receipts" icon={FileText}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <select value={fyStart} onChange={(e) => setFyStart(e.target.value)} style={{ ...selStyle, width: 160 }}>
            {[0, -1, -2].map((offset) => {
              const start = fyStartFor(offset, thisFYStart);
              return (
                <option key={start} value={start}>
                  {fyLabel(start)}
                </option>
              );
            })}
          </select>
        </div>

        {fyReceipts.length === 0 ? (
          <div style={{ fontSize: 12.5, color: MUTE }}>Nothing logged for {fyLabel(fyStart)} yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fyReceipts.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", background: SURFACE_SUBTLE, border: `1px solid ${LINE}`, borderRadius: 8, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{r.description}</div>
                  <div style={{ fontSize: 11.5, color: MUTE }}>
                    {r.date} · {DEDUCTION_CATEGORY_LABELS[r.deduction_category]}
                    {r.transaction_id && " · from Expenses"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: NAVY }}>{AUD(r.amount)}</span>
                  {r.file_path && (
                    <button onClick={() => onViewReceipt(r.file_path!)} title="View receipt" style={{ background: "none", border: "none", cursor: "pointer", color: MUTE_ICON, display: "flex" }}>
                      <ExternalLink size={15} />
                    </button>
                  )}
                  <button onClick={() => onDelete(r.id, r.description)} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: MUTE_ICON, display: "flex" }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
