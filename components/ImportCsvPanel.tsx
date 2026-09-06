"use client";

import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, Check, X, Repeat } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { useToast } from "@/components/ToastProvider";
import { parseBankCSV, isLikelyDuplicateTransaction, detectRecurringCandidates, type RecurringCandidate } from "@/lib/csv";
import { AUD } from "@/lib/money";
import { ACCOUNTS, CARD, LINE, MUTE, GOLD, INK, NAVY, UNFAV, selStyle } from "@/lib/theme";
import { Collapsible } from "@/components/ui/atoms";
import type { Account } from "@/lib/theme";

interface ImportRow {
  include: boolean;
  date: string; // ISO — "" means the original date couldn't be parsed and needs fixing
  description: string;
  amount: string; // kept as a string so the input can be edited freely
  categoryKey: string;
  account: Account;
  isDuplicate: boolean;
}

interface CandidateRow extends RecurringCandidate {
  categoryKey: string;
  account: Account;
  status: "pending" | "busy" | "added";
}

export default function ImportCsvPanel({ catOptions }: { catOptions: { key: string; label: string }[] }) {
  const { transactions, addTransactionsBulk, recurringExpenses, addRecurringExpense } = useAppData();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkCategory, setBulkCategory] = useState(catOptions[0]?.key ?? "other");

  const handleFile = async (file: File) => {
    setFileError("");
    const text = await file.text();
    const parsed = parseBankCSV(text);
    if (parsed.error) {
      setFileError(`${parsed.error} Expected a Date, Description, and either an Amount or Debit column.`);
      setRows(null);
      return;
    }
    const existing = transactions.map((t) => ({ date: t.date, amount: Number(t.amount) || 0 }));
    const usable = parsed.rows.filter((r) => r.amount !== null);
    setSkippedCount(parsed.rows.length - usable.length);
    setRows(
      usable.map((r) => {
        const isDuplicate = r.date !== null && isLikelyDuplicateTransaction(r.date, r.amount as number, existing);
        return {
          include: r.date !== null && !isDuplicate,
          date: r.date ?? "",
          description: r.description,
          amount: String(r.amount),
          categoryKey: catOptions[0]?.key ?? "other",
          account: "Credit card",
          isDuplicate,
        };
      })
    );

    const detected = detectRecurringCandidates(
      usable.filter((r): r is typeof r & { date: string; amount: number } => r.date !== null).map((r) => ({ date: r.date, description: r.description, amount: r.amount })),
      recurringExpenses.map((r) => r.description)
    );
    setCandidates(detected.map((c) => ({ ...c, categoryKey: catOptions[0]?.key ?? "other", account: "Credit card", status: "pending" })));
  };

  const updateRow = (i: number, patch: Partial<ImportRow>) => setRows((rs) => rs && rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const updateCandidate = (i: number, patch: Partial<CandidateRow>) => setCandidates((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const onAddCandidate = async (i: number) => {
    const c = candidates[i];
    updateCandidate(i, { status: "busy" });
    try {
      await addRecurringExpense(c.description, c.amount, c.categoryKey, c.account, c.frequency, c.nextDue);
      updateCandidate(i, { status: "added" });
      toast(`Added "${c.description}" as a recurring bill`);
    } catch {
      updateCandidate(i, { status: "pending" });
      toast("Could not add that recurring bill — try again");
    }
  };

  const reset = () => {
    setRows(null);
    setCandidates([]);
    setFileError("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const includedRows = rows?.filter((r) => r.include) ?? [];
  const readyRows = includedRows.filter((r) => r.date && Number(r.amount) > 0);

  const applyBulkCategory = () => setRows((rs) => rs && rs.map((r) => (r.include ? { ...r, categoryKey: bulkCategory } : r)));

  const onImport = async () => {
    if (readyRows.length === 0) return;
    setBusy(true);
    try {
      await addTransactionsBulk(
        readyRows.map((r) => ({ date: r.date, description: r.description || "Imported", amount: Number(r.amount), category_key: r.categoryKey, account: r.account }))
      );
      toast(`Imported ${readyRows.length} expense${readyRows.length === 1 ? "" : "s"}`);
      reset();
    } catch {
      toast("Could not import — nothing was saved, try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Collapsible title="Import from bank statement (CSV)" icon={FileSpreadsheet} subtitle="Bulk-log a card statement export instead of typing each purchase in by hand.">
      <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {!rows && (
          <>
            <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.5 }}>
              Needs a Date column, a Description column, and either a signed Amount column (negative = money out) or a Debit column. Every row lands here for review first — nothing
              is saved until you click Import.
            </div>
            <button
              onClick={() => fileInput.current?.click()}
              style={{
                alignSelf: "flex-start",
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                color: INK,
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                padding: "8px 13px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "var(--font-space-grotesk), sans-serif",
              }}
            >
              <Upload size={14} /> Choose CSV file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {fileError && <div style={{ fontSize: 12, color: UNFAV }}>{fileError}</div>}
          </>
        )}

        {rows && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12.5, color: MUTE }}>
                {readyRows.length} of {rows.length} row{rows.length === 1 ? "" : "s"} ready to import
                {skippedCount > 0 ? ` · ${skippedCount} skipped (looked like income/credits)` : ""}
                {rows.some((r) => r.isDuplicate) ? " · possible duplicates unchecked by default" : ""}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} style={{ ...selStyle, height: 32, fontSize: 12 }}>
                  {catOptions.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={applyBulkCategory}
                  style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer", color: NAVY }}
                >
                  Set category for all selected
                </button>
              </div>
            </div>

            <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "auto", maxHeight: 420 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: NAVY, color: "#fff", textAlign: "left" }}>
                    <th style={{ padding: "8px 6px" }} />
                    <th style={{ padding: "8px 6px" }}>Date</th>
                    <th style={{ padding: "8px 6px" }}>Description</th>
                    <th style={{ padding: "8px 6px", textAlign: "right" }}>Amount</th>
                    <th style={{ padding: "8px 6px" }}>Category</th>
                    <th style={{ padding: "8px 6px" }}>Account</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${LINE}`, background: r.isDuplicate ? "#FBEDE9" : CARD }}>
                      <td style={{ padding: "5px 6px" }}>
                        <input type="checkbox" checked={r.include} onChange={(e) => updateRow(i, { include: e.target.checked })} />
                      </td>
                      <td style={{ padding: "5px 6px" }}>
                        <input type="date" value={r.date} onChange={(e) => updateRow(i, { date: e.target.value })} style={{ ...selStyle, height: 30, fontSize: 12, width: 130 }} />
                      </td>
                      <td style={{ padding: "5px 6px", minWidth: 160 }}>
                        <input
                          type="text"
                          value={r.description}
                          onChange={(e) => updateRow(i, { description: e.target.value })}
                          style={{ ...selStyle, height: 30, fontSize: 12, width: "100%", textAlign: "left" }}
                        />
                      </td>
                      <td style={{ padding: "5px 6px" }}>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={r.amount}
                          onChange={(e) => updateRow(i, { amount: e.target.value })}
                          style={{ ...selStyle, height: 30, fontSize: 12, width: 90, textAlign: "right" }}
                        />
                      </td>
                      <td style={{ padding: "5px 6px" }}>
                        <select value={r.categoryKey} onChange={(e) => updateRow(i, { categoryKey: e.target.value })} style={{ ...selStyle, height: 30, fontSize: 12, width: 130 }}>
                          {catOptions.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: "5px 6px" }}>
                        <select value={r.account} onChange={(e) => updateRow(i, { account: e.target.value as Account })} style={{ ...selStyle, height: 30, fontSize: 12, width: 110 }}>
                          {ACCOUNTS.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 12.5, color: MUTE }}>Total {AUD(readyRows.reduce((s, r) => s + (Number(r.amount) || 0), 0))}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={reset} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: MUTE, border: `1px solid ${LINE}`, borderRadius: 8, padding: "9px 15px", fontSize: 13, cursor: "pointer" }}>
                  <X size={14} /> Cancel
                </button>
                <button
                  onClick={onImport}
                  disabled={readyRows.length === 0 || busy}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: readyRows.length === 0 ? "transparent" : GOLD,
                    color: readyRows.length === 0 ? MUTE : INK,
                    border: readyRows.length === 0 ? `1px solid ${LINE}` : "none",
                    borderRadius: 8,
                    padding: "9px 15px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: readyRows.length === 0 || busy ? "default" : "pointer",
                    opacity: busy ? 0.7 : 1,
                    fontFamily: "var(--font-space-grotesk), sans-serif",
                  }}
                >
                  <Check size={14} /> {busy ? "Importing…" : `Import ${readyRows.length}`}
                </button>
              </div>
            </div>

            {candidates.length > 0 && (
              <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 12, background: "#FBF9F2", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: NAVY }}>
                  <Repeat size={14} color={GOLD} /> Possible recurring bills spotted in this statement
                </div>
                {candidates.map((c, i) => (
                  <div key={`${c.description}-${c.amount}`} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
                    <span style={{ flex: "1 1 200px", color: NAVY }}>
                      {c.description} — {AUD(c.amount)} · {c.frequency} ({c.occurrences}× in this import)
                    </span>
                    <select value={c.categoryKey} onChange={(e) => updateCandidate(i, { categoryKey: e.target.value })} disabled={c.status !== "pending"} style={{ ...selStyle, height: 30, fontSize: 12, width: 120 }}>
                      {catOptions.map((cat) => (
                        <option key={cat.key} value={cat.key}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={c.account}
                      onChange={(e) => updateCandidate(i, { account: e.target.value as Account })}
                      disabled={c.status !== "pending"}
                      style={{ ...selStyle, height: 30, fontSize: 12, width: 110 }}
                    >
                      {ACCOUNTS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => onAddCandidate(i)}
                      disabled={c.status !== "pending"}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        background: c.status === "added" ? "transparent" : GOLD,
                        color: c.status === "added" ? "#2E7D5B" : INK,
                        border: c.status === "added" ? "none" : "none",
                        borderRadius: 8,
                        padding: "6px 11px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: c.status === "pending" ? "pointer" : "default",
                        opacity: c.status === "busy" ? 0.7 : 1,
                        fontFamily: "var(--font-space-grotesk), sans-serif",
                      }}
                    >
                      <Check size={13} /> {c.status === "added" ? "Added" : c.status === "busy" ? "Adding…" : "Add as recurring"}
                    </button>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: MUTE, lineHeight: 1.4 }}>
                  Detected from this statement alone (same description + amount, evenly spaced) — review the category/account before adding, they default to a guess.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Collapsible>
  );
}
