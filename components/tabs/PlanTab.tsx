"use client";

import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { isoFromDate } from "@/lib/period";
import { sinkingFundTotal } from "@/lib/derive";
import { AUD } from "@/lib/money";
import { NAVY, MUTE, GOLD, LINE, INK, inputStyle, selStyle } from "@/lib/theme";
import { Panel, Field } from "@/components/ui/atoms";
import type { BudgetFrequency } from "@/lib/types";

export default function PlanTab() {
  const { categories, recurringExpenses, D, updateCategory, addCategory, deleteCategory } = useAppData();
  const recurringFortnightTotal = sinkingFundTotal(recurringExpenses, isoFromDate(new Date()));
  const activeRecurringCount = recurringExpenses.filter((r) => r.active).length;
  const [catInputs, setCatInputs] = useState<Record<string, { label: string; a26: string; a27: string }>>(() =>
    Object.fromEntries(categories.map((c) => [c.key, { label: c.label, a26: String(c.amount_2026), a27: String(c.amount_2027) }]))
  );
  const [flashMsg, setFlashMsg] = useState("");
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatBusy, setNewCatBusy] = useState(false);

  const flash = (m = "Saved") => {
    setFlashMsg(m);
    setTimeout(() => setFlashMsg(""), 1300);
  };

  const commitCategory = async (key: string, field: "label" | "a26" | "a27" | "frequency", raw?: string) => {
    const c = categories.find((cc) => cc.key === key);
    const v = catInputs[key];
    const label = (field === "label" ? raw : v?.label) ?? c?.label ?? "";
    const a26 = (field === "a26" ? raw : v?.a26) ?? String(c?.amount_2026 ?? 0);
    const a27 = (field === "a27" ? raw : v?.a27) ?? String(c?.amount_2027 ?? 0);
    const frequency = ((field === "frequency" ? raw : c?.frequency) ?? "monthly") as BudgetFrequency;
    if (!label.trim()) return;
    try {
      await updateCategory(key, { label: label.trim(), amount_2026: Number(a26) || 0, amount_2027: Number(a27) || 0, frequency });
      flash();
    } catch {
      flash("Could not save that category");
    }
  };

  const onDeleteCategory = async (key: string, label: string) => {
    if (!window.confirm(`Remove "${label}" from your budget? Past transactions logged against it stay, just unlabelled going forward.`)) return;
    try {
      await deleteCategory(key);
      setCatInputs((ci) => {
        const next = { ...ci };
        delete next[key];
        return next;
      });
      flash("Category removed");
    } catch {
      flash("Could not remove that category");
    }
  };

  const onAddCategory = async () => {
    if (!newCatLabel.trim()) return;
    setNewCatBusy(true);
    try {
      await addCategory(newCatLabel);
      setNewCatLabel("");
      flash("Category added");
    } finally {
      setNewCatBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Budget</div>
        <div style={{ fontSize: 12.5, color: MUTE }}>
          Edit your category amounts and the whole app recalculates. Pay cycle, tax, and other assumptions live on{" "}
          <b style={{ color: NAVY }}>Settings</b>. {flashMsg && <b style={{ color: GOLD }}>{flashMsg}</b>}
        </div>
      </div>
      <Panel title="Budgeted expenses">
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 74px 1fr 1fr 26px", gap: 6, alignItems: "center", marginBottom: 4 }}>
          <span />
          <span />
          <span style={{ fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", textAlign: "right" }}>2026 (now)</span>
          <span style={{ fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", textAlign: "right" }}>2027 +</span>
          <span />
        </div>
        {categories.map((c) => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.1fr 74px 1fr 1fr 26px", gap: 6, alignItems: "center", padding: "3px 0" }}>
            <input
              type="text"
              value={catInputs[c.key]?.label ?? c.label}
              onChange={(e) => setCatInputs((ci) => ({ ...ci, [c.key]: { label: e.target.value, a26: ci[c.key]?.a26 ?? String(c.amount_2026), a27: ci[c.key]?.a27 ?? String(c.amount_2027) } }))}
              onBlur={(e) => commitCategory(c.key, "label", e.target.value)}
              style={{ ...inputStyle, textAlign: "left", fontSize: 13 }}
            />
            <select value={c.frequency} onChange={(e) => commitCategory(c.key, "frequency", e.target.value)} style={{ ...selStyle, fontSize: 11.5, padding: "6px 2px" }}>
              <option value="weekly">/wk</option>
              <option value="monthly">/mo</option>
            </select>
            <input
              type="number"
              inputMode="decimal"
              value={catInputs[c.key]?.a26 ?? String(c.amount_2026)}
              onChange={(e) => setCatInputs((ci) => ({ ...ci, [c.key]: { label: ci[c.key]?.label ?? c.label, a26: e.target.value, a27: ci[c.key]?.a27 ?? String(c.amount_2027) } }))}
              onBlur={(e) => commitCategory(c.key, "a26", e.target.value)}
              style={inputStyle}
            />
            <input
              type="number"
              inputMode="decimal"
              value={catInputs[c.key]?.a27 ?? String(c.amount_2027)}
              onChange={(e) => setCatInputs((ci) => ({ ...ci, [c.key]: { label: ci[c.key]?.label ?? c.label, a26: ci[c.key]?.a26 ?? String(c.amount_2026), a27: e.target.value } }))}
              onBlur={(e) => commitCategory(c.key, "a27", e.target.value)}
              style={inputStyle}
            />
            <button onClick={() => onDeleteCategory(c.key, catInputs[c.key]?.label ?? c.label)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C2B4", display: "flex", justifyContent: "center" }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 74px 1fr 1fr 26px", gap: 6, marginTop: 8, paddingTop: 8, borderTop: `2px solid ${GOLD}`, fontWeight: 700, fontFamily: "var(--font-space-grotesk), sans-serif", fontVariantNumeric: "tabular-nums" }}>
          <span>Total / mo</span>
          <span />
          <span style={{ textAlign: "right" }}>{AUD(D.expMo(2026))}</span>
          <span style={{ textAlign: "right" }}>{AUD(D.expMo(2027))}</span>
          <span />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 74px 1fr 1fr 26px", gap: 6, marginTop: 4, fontSize: 12, color: MUTE, fontVariantNumeric: "tabular-nums" }}>
          <span>Per fortnight</span>
          <span />
          <span style={{ textAlign: "right" }}>{AUD(D.expFN(2026))}</span>
          <span style={{ textAlign: "right" }}>{AUD(D.expFN(2027))}</span>
          <span />
        </div>
        {activeRecurringCount > 0 && (
          <div style={{ marginTop: 12, padding: "10px 12px", background: "#F4EFE1", borderRadius: 8, fontSize: 12, color: NAVY, lineHeight: 1.5 }}>
            Plus <b>{AUD(recurringFortnightTotal, 2)}/fn</b> set aside for {activeRecurringCount} recurring bill{activeRecurringCount === 1 ? "" : "s"} on{" "}
            <b>Expenses</b> (rego, insurance, subscriptions) — not counted in the totals above, so check nothing&apos;s budgeted in both places at once.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}`, alignItems: "flex-end" }}>
          <Field label="New category" grow>
            <input
              type="text"
              placeholder="e.g. Subscriptions"
              value={newCatLabel}
              onChange={(e) => setNewCatLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddCategory()}
              style={{ ...selStyle, width: "100%", textAlign: "left" }}
            />
          </Field>
          <button
            onClick={onAddCategory}
            disabled={newCatBusy || !newCatLabel.trim()}
            style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: INK, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: newCatBusy ? "default" : "pointer", opacity: newCatBusy || !newCatLabel.trim() ? 0.6 : 1, fontFamily: "var(--font-space-grotesk), sans-serif", height: 36 }}
          >
            <Plus size={14} /> Add
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: MUTE, marginTop: 10, lineHeight: 1.5 }}>
          Pick /wk or /mo per category, whichever the bill actually comes as — groceries as a weekly figure, insurance as a
          monthly one, say. Weekly converts to fortnightly exactly (× 2); monthly is annualized then split across 26
          fortnights (× 12 ÷ 26). New categories start at $0 — set the amount above once added. Editing here won&apos;t touch
          your Excel — use <b style={{ color: NAVY }}>Copy figures for Claude</b> on <b style={{ color: NAVY }}>Settings</b> to
          resync it.
        </div>
      </Panel>
    </div>
  );
}
