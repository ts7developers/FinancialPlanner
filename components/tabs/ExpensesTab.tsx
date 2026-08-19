"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Plus, Trash2, Wallet, Receipt, ListChecks, Flame, Repeat, Pause, Play, Zap, ChevronDown } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { useIsMobile } from "@/lib/useIsMobile";
import { periodKeyOf, periodLabel, isoFromDate } from "@/lib/period";
import { OTHER_CATEGORY_KEY } from "@/lib/categories";
import { periodTotals, averageSpend, buildActualSpendTrend, daysUntil, type PieSlice } from "@/lib/derive";
import { AUD } from "@/lib/money";
import { ACCOUNTS, ACC_COLOR, CARD, LINE, MUTE, GOLD, INK, NAVY, FAV, PIE_COLORS, selStyle } from "@/lib/theme";
import { Field, Toast, Metric } from "@/components/ui/atoms";
import ChartSkeleton from "@/components/charts/ChartSkeleton";
import type { Transaction, RecurringExpense, RecurringFrequency } from "@/lib/types";

const FREQ_LABEL: Record<RecurringFrequency, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const ActualSpendTrendChart = dynamic(() => import("@/components/charts/ActualSpendTrendChart"), { ssr: false, loading: () => <ChartSkeleton height={200} /> });
const MoneyGoesChart = dynamic(() => import("@/components/charts/MoneyGoesChart"), { ssr: false, loading: () => <ChartSkeleton height={160} /> });

function todayLocalISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/** Most-used categories first, for the one-tap quick-select chips. */
function topCategories(transactions: Transaction[], n = 4): string[] {
  const counts: Record<string, number> = {};
  transactions.forEach((t) => {
    counts[t.category_key] = (counts[t.category_key] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export default function ExpensesTab() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    profile,
    categories,
    transactions,
    periods,
    loggedByCat,
    addTransaction,
    deleteTransaction,
    undoDeleteTransaction,
    recurringExpenses,
    addRecurringExpense,
    deleteRecurringExpense,
    toggleRecurringExpense,
    logRecurringExpense,
  } = useAppData();
  // Budgeted categories from Budget, plus the synthetic "Other" catch-all (not a real budget
  // row — $0 planned, always available for expenses that don't fit an existing category).
  const catOptions = [...categories.map((c) => ({ key: c.key, label: c.label })), { key: OTHER_CATEGORY_KEY, label: "Other" }];

  const [form, setForm] = useState(() => ({
    date: "",
    desc: "",
    amount: "",
    catId: transactions[0]?.category_key || categories[0]?.key || OTHER_CATEGORY_KEY,
    account: "Credit card" as string,
  }));
  const [txnFilter, setTxnFilter] = useState("all");
  const [flashMsg, setFlashMsg] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; desc: string } | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const [recForm, setRecForm] = useState(() => ({
    desc: "",
    amount: "",
    catId: OTHER_CATEGORY_KEY,
    account: "Credit card" as string,
    frequency: "monthly" as RecurringFrequency,
    nextDue: "",
  }));
  const [recBusy, setRecBusy] = useState<string | null>(null);
  const [showMoreRecurring, setShowMoreRecurring] = useState(false);

  useEffect(() => {
    // Must run client-only: the server has no notion of the user's local calendar day,
    // so computing this during render would mismatch between SSR and hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((f) => (f.date ? f : { ...f, date: todayLocalISO() }));
    setRecForm((f) => (f.nextDue ? f : { ...f, nextDue: todayLocalISO() }));
  }, []);

  useEffect(() => {
    // Arrived via the quick-add FAB — jump straight to the amount field and drop the marker.
    if (searchParams.get("add") === "1") {
      amountRef.current?.focus();
      router.replace("/expenses");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (m = "Saved") => {
    setFlashMsg(m);
    setTimeout(() => setFlashMsg(""), 1300);
  };

  const addTxn = async () => {
    if (!form.amount || !form.date) {
      flash("Add a date and amount");
      return;
    }
    try {
      await addTransaction({
        date: form.date,
        description: form.desc,
        amount: Number(form.amount),
        category_key: form.catId,
        account: form.account,
      });
      setForm((f) => ({ ...f, desc: "", amount: "" }));
      flash("Expense logged");
    } catch {
      flash("Could not log that expense");
    }
  };

  // Falls back for a category deleted on Budget since this transaction was logged — the spend
  // itself is untouched (and still counted under "Other" on Reconcile), just unlabelled here.
  const catLabel = (id: string) => catOptions.find((c) => c.key === id)?.label || "Deleted category";
  const quickCats = topCategories(transactions);
  const dateBeforeAnchor = form.date !== "" && periodKeyOf(form.date, profile.pay_anchor) === null;
  const recDateBeforeAnchor = recForm.nextDue !== "" && periodKeyOf(recForm.nextDue, profile.pay_anchor) === null;

  const today = form.date || todayLocalISO();
  const activeRecurring = recurringExpenses.filter((r) => r.active).sort((a, b) => a.next_due.localeCompare(b.next_due));
  const pausedRecurring = recurringExpenses.filter((r) => !r.active);
  const dueRecurring = activeRecurring.filter((r) => daysUntil(r.next_due, today) <= 0);
  const upcomingRecurring = activeRecurring.filter((r) => daysUntil(r.next_due, today) > 0);
  const recurringMonthlyTotal = activeRecurring.reduce((s, r) => {
    const perYear = r.frequency === "weekly" ? 52 : r.frequency === "fortnightly" ? 26 : r.frequency === "monthly" ? 12 : r.frequency === "quarterly" ? 4 : 1;
    return s + (r.amount * perYear) / 12;
  }, 0);

  const addRecurring = async () => {
    if (!recForm.amount || !recForm.desc.trim() || !recForm.nextDue) {
      flash("Add a description, amount and start date");
      return;
    }
    try {
      await addRecurringExpense(recForm.desc, Number(recForm.amount), recForm.catId, recForm.account, recForm.frequency, recForm.nextDue);
      setRecForm((f) => ({ ...f, desc: "", amount: "" }));
      flash("Recurring expense added");
    } catch {
      flash("Could not add that recurring expense");
    }
  };

  const onLogRecurring = async (r: RecurringExpense) => {
    setRecBusy(r.id);
    try {
      await logRecurringExpense(r.id);
      flash(`Logged ${r.description}`);
    } catch {
      flash(`Could not log ${r.description}`);
    } finally {
      setRecBusy(null);
    }
  };

  const onToggleRecurring = async (r: RecurringExpense) => {
    try {
      await toggleRecurringExpense(r.id);
    } catch {
      flash(`Could not ${r.active ? "pause" : "resume"} ${r.description}`);
    }
  };

  const onDeleteRecurring = async (r: RecurringExpense) => {
    try {
      await deleteRecurringExpense(r.id);
    } catch {
      flash(`Could not remove ${r.description}`);
    }
  };

  const onDelete = (t: Transaction) => {
    deleteTransaction(t.id, () => flash("Could not delete that expense — it's back"));
    const desc = t.description || catLabel(t.category_key);
    setPendingDelete({ id: t.id, desc });
    setTimeout(() => setPendingDelete((p) => (p?.id === t.id ? null : p)), 5000);
  };
  const onUndo = () => {
    if (!pendingDelete) return;
    undoDeleteTransaction(pendingDelete.id);
    setPendingDelete(null);
  };

  const filteredTxns = transactions
    .filter((t) => txnFilter === "all" || periodKeyOf(t.date, profile.pay_anchor) === txnFilter)
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const filterTotal = filteredTxns.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const byAccount = ACCOUNTS.map((acc) => ({
    acc,
    total: filteredTxns.filter((t) => t.account === acc).reduce((s, t) => s + (Number(t.amount) || 0), 0),
  })).filter((x) => x.total > 0);

  const avgPerPeriod = averageSpend(periodTotals(loggedByCat));
  const avgTxn = transactions.length > 0 ? transactions.reduce((s, t) => s + (Number(t.amount) || 0), 0) / transactions.length : 0;
  const spendTrend = buildActualSpendTrend(periods, loggedByCat, isoFromDate(new Date()));
  // The chart's own average, over exactly the fortnights it displays — not avgPerPeriod (all
  // periods ever logged in), which the "gold line = your average, last N fortnights" caption
  // would otherwise misrepresent whenever the two windows disagree.
  const spendTrendAvg = spendTrend.length > 0 ? spendTrend.reduce((s, p) => s + p.total, 0) / spendTrend.length : 0;
  // Sorted once here (not re-sorted separately for the legend) so the pie's slice colours and
  // the legend's swatches share the same index — sorting twice independently previously left
  // them mismatched, colouring the legend as if it were still in the unsorted order.
  const categoryTotals: PieSlice[] = catOptions
    .map((c) => ({
      name: c.label,
      value: filteredTxns.filter((t) => t.category_key === c.key).reduce((s, t) => s + (Number(t.amount) || 0), 0),
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const categoryTotal = categoryTotals.reduce((s, d) => s + d.value, 0);
  const biggestCategory = categoryTotals[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 12 }}>Log an expense</div>
        {quickCats.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {quickCats.map((id) => {
              const on = form.catId === id;
              return (
                <button
                  key={id}
                  onClick={() => setForm((f) => ({ ...f, catId: id }))}
                  style={{
                    background: on ? GOLD : "#F4EFE1",
                    color: on ? INK : NAVY,
                    border: "none",
                    borderRadius: 999,
                    padding: "6px 12px",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {catLabel(id)}
                </button>
              );
            })}
          </div>
        )}
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Amount">
              <div style={{ display: "flex", alignItems: "center", gap: 4, border: `1px solid ${LINE}`, borderRadius: 8, background: "#FCFBF7", padding: "4px 10px" }}>
                <span style={{ color: MUTE, fontSize: 20 }}>$</span>
                <input
                  ref={amountRef}
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  style={{ border: "none", background: "transparent", outline: "none", width: "100%", fontSize: 22, fontWeight: 600, fontFamily: "var(--font-space-grotesk), sans-serif", color: NAVY, textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "6px 0" }}
                />
              </div>
            </Field>
            <Field label="Description">
              <input type="text" placeholder="e.g. Woolworths" value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} style={{ ...selStyle, width: "100%", textAlign: "left", height: 42 }} />
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Category" grow>
                <select value={form.catId} onChange={(e) => setForm((f) => ({ ...f, catId: e.target.value }))} style={{ ...selStyle, width: "100%", height: 42 }}>
                  {catOptions.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Account / card" grow>
                <select value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))} style={{ ...selStyle, width: "100%", height: 42 }}>
                  {ACCOUNTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Date">
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ ...selStyle, width: "100%", height: 42 }} />
            </Field>
            <button onClick={addTxn} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: GOLD, color: INK, border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-space-grotesk), sans-serif" }}>
              <Plus size={18} /> Add expense
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label="Date">
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ ...selStyle, width: 150 }} />
            </Field>
            <Field label="Description" grow>
              <input type="text" placeholder="e.g. Woolworths" value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} style={{ ...selStyle, width: "100%", textAlign: "left" }} />
            </Field>
            <Field label="Amount">
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ color: MUTE, fontSize: 13 }}>$</span>
                <input
                  ref={amountRef}
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addTxn()}
                  style={{ ...selStyle, width: 100, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                />
              </div>
            </Field>
            <Field label="Category">
              <select value={form.catId} onChange={(e) => setForm((f) => ({ ...f, catId: e.target.value }))} style={{ ...selStyle, width: 140 }}>
                {catOptions.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Account / card">
              <select value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))} style={{ ...selStyle, width: 140 }}>
                {ACCOUNTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
            <button onClick={addTxn} style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: INK, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-space-grotesk), sans-serif", height: 36 }}>
              <Plus size={15} /> Add
            </button>
          </div>
        )}
        {dateBeforeAnchor && (
          <div style={{ fontSize: 12, color: "#C0492F", marginTop: 10 }}>
            This date is before your pay cycle starts (see <b>Budget</b>) — it&apos;ll still update balances, but won&apos;t auto-fill into Reconcile or the plan-vs-actual charts.
          </div>
        )}
        {flashMsg && <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginTop: 10 }}>{flashMsg}</div>}
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>
            <Repeat size={16} color={GOLD} /> Recurring expenses
          </div>
          {activeRecurring.length > 0 && <div style={{ fontSize: 12, color: MUTE }}>~{AUD(recurringMonthlyTotal)} / month across {activeRecurring.length}</div>}
        </div>

        {dueRecurring.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: upcomingRecurring.length || pausedRecurring.length ? 14 : 0 }}>
            {dueRecurring.map((r) => {
              const overdueDays = -daysUntil(r.next_due, today);
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#FBF3E0", border: `1px solid ${GOLD}`, borderRadius: 10, flexWrap: "wrap" }}>
                  <Zap size={15} color={GOLD} style={{ flexShrink: 0 }} />
                  <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div>
                    <div style={{ fontSize: 11, color: MUTE, marginTop: 1 }}>
                      {FREQ_LABEL[r.frequency]} · {catLabel(r.category_key)} · {r.account} · {overdueDays > 0 ? `${overdueDays}d overdue` : "due today"}
                    </div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{AUD(Number(r.amount), 2)}</span>
                  <button
                    onClick={() => onLogRecurring(r)}
                    disabled={recBusy === r.id}
                    style={{ display: "flex", alignItems: "center", gap: 5, background: GOLD, color: INK, border: "none", borderRadius: 7, padding: "7px 12px", fontSize: 12.5, fontWeight: 700, cursor: recBusy === r.id ? "default" : "pointer", opacity: recBusy === r.id ? 0.6 : 1, fontFamily: "var(--font-space-grotesk), sans-serif" }}
                  >
                    <Plus size={13} /> Log it
                  </button>
                  <button onClick={() => onToggleRecurring(r)} title="Pause" style={{ background: "none", border: "none", cursor: "pointer", color: "#A99B6E", display: "flex" }}>
                    <Pause size={14} />
                  </button>
                  <button onClick={() => onDeleteRecurring(r)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C2B4", display: "flex" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {(upcomingRecurring.length > 0 || pausedRecurring.length > 0) && (
          <button
            onClick={() => setShowMoreRecurring((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: MUTE, fontSize: 12, fontWeight: 600, padding: "4px 0", marginBottom: showMoreRecurring ? 6 : 0 }}
          >
            <ChevronDown size={13} style={{ transform: showMoreRecurring ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
            {showMoreRecurring ? "Hide" : "Show"} {upcomingRecurring.length + pausedRecurring.length} more (upcoming / paused)
          </button>
        )}

        {showMoreRecurring && upcomingRecurring.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: pausedRecurring.length ? 14 : 0 }}>
            {upcomingRecurring.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
                <div style={{ flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div>
                <span style={{ fontSize: 11.5, color: MUTE, flex: "0 0 auto" }}>
                  {FREQ_LABEL[r.frequency]} · next {r.next_due.slice(5)} · in {daysUntil(r.next_due, today)}d
                </span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500, flex: "0 0 auto" }}>{AUD(Number(r.amount), 2)}</span>
                <button onClick={() => onToggleRecurring(r)} title="Pause" style={{ background: "none", border: "none", cursor: "pointer", color: "#A99B6E", display: "flex" }}>
                  <Pause size={13} />
                </button>
                <button onClick={() => onDeleteRecurring(r)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C2B4", display: "flex" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {showMoreRecurring && pausedRecurring.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 14 }}>
            {pausedRecurring.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: `1px solid ${LINE}`, fontSize: 13, opacity: 0.55 }}>
                <div style={{ flex: "1 1 160px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div>
                <span style={{ fontSize: 11.5, color: MUTE, flex: "0 0 auto" }}>{FREQ_LABEL[r.frequency]} · paused</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500, flex: "0 0 auto" }}>{AUD(Number(r.amount), 2)}</span>
                <button onClick={() => onToggleRecurring(r)} title="Resume" style={{ background: "none", border: "none", cursor: "pointer", color: FAV, display: "flex" }}>
                  <Play size={13} />
                </button>
                <button onClick={() => onDeleteRecurring(r)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C2B4", display: "flex" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {recurringExpenses.length === 0 && <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 14 }}>Nothing set up yet — add a rent payment, subscription, or insurance premium below.</div>}

        <div style={{ paddingTop: 12, borderTop: `1px solid ${LINE}`, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Description" grow>
            <input type="text" placeholder="e.g. Netflix" value={recForm.desc} onChange={(e) => setRecForm((f) => ({ ...f, desc: e.target.value }))} style={{ ...selStyle, width: "100%", textAlign: "left" }} />
          </Field>
          <Field label="Amount">
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ color: MUTE, fontSize: 13 }}>$</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={recForm.amount}
                onChange={(e) => setRecForm((f) => ({ ...f, amount: e.target.value }))}
                style={{ ...selStyle, width: 90, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              />
            </div>
          </Field>
          <Field label="Category">
            <select value={recForm.catId} onChange={(e) => setRecForm((f) => ({ ...f, catId: e.target.value }))} style={{ ...selStyle, width: 130 }}>
              {catOptions.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Account / card">
            <select value={recForm.account} onChange={(e) => setRecForm((f) => ({ ...f, account: e.target.value }))} style={{ ...selStyle, width: 130 }}>
              {ACCOUNTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Repeats">
            <select value={recForm.frequency} onChange={(e) => setRecForm((f) => ({ ...f, frequency: e.target.value as RecurringFrequency }))} style={{ ...selStyle, width: 120 }}>
              {(Object.keys(FREQ_LABEL) as RecurringFrequency[]).map((f) => (
                <option key={f} value={f}>
                  {FREQ_LABEL[f]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Next due">
            <input type="date" value={recForm.nextDue} onChange={(e) => setRecForm((f) => ({ ...f, nextDue: e.target.value }))} style={{ ...selStyle, width: 140 }} />
          </Field>
          <button onClick={addRecurring} style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: INK, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-space-grotesk), sans-serif", height: 36 }}>
            <Plus size={15} /> Add
          </button>
        </div>
        {recDateBeforeAnchor && (
          <div style={{ fontSize: 12, color: "#C0492F", marginTop: 10 }}>
            This due date is before your pay cycle starts (see <b>Budget</b>) — logging it will still update balances, but won&apos;t auto-fill into Reconcile.
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Metric icon={Wallet} label="Avg / fortnight" value={AUD(avgPerPeriod)} sub="across periods you've logged in" />
        <Metric icon={Receipt} label="Avg transaction" value={AUD(avgTxn, 2)} sub={`${transactions.length} logged all-time`} />
        <Metric icon={ListChecks} label="Transactions (this view)" value={String(filteredTxns.length)} sub={txnFilter === "all" ? "all fortnights" : "this fortnight"} />
        <Metric icon={Flame} label="Biggest category (this view)" value={biggestCategory ? AUD(biggestCategory.value) : "—"} sub={biggestCategory ? biggestCategory.name : "nothing logged"} />
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 18px 6px", flex: "1 1 380px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Spend trend</div>
            <div style={{ fontSize: 12, color: MUTE }}>gold line = your average, last {spendTrend.length} fortnights</div>
          </div>
          <ActualSpendTrendChart data={spendTrend} average={spendTrendAvg} />
        </div>
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, flex: "1 1 300px" }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>By category (this view)</div>
          {categoryTotals.length === 0 ? (
            <div style={{ fontSize: 12.5, color: MUTE }}>Nothing logged for this filter.</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <MoneyGoesChart data={categoryTotals} size={150} />
              <div style={{ flex: 1, minWidth: 140, display: "flex", flexDirection: "column", gap: 4 }}>
                {categoryTotals.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MUTE }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                    {d.name} <span style={{ marginLeft: "auto", color: NAVY, fontVariantNumeric: "tabular-nums" }}>{categoryTotal > 0 ? ((d.value / categoryTotal) * 100).toFixed(0) : 0}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 640px" }}>
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${LINE}`, gap: 8 }}>
              <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Transactions</div>
              <select value={txnFilter} onChange={(e) => setTxnFilter(e.target.value)} style={selStyle}>
                <option value="all">All fortnights</option>
                {periods.map((p) => (
                  <option key={p.key} value={p.key}>
                    {periodLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            {filteredTxns.length === 0 ? (
              <div style={{ padding: 24, fontSize: 13, color: MUTE, textAlign: "center" }}>
                No expenses logged yet. Add one above — it flows into the matching category on the Reconcile tab for its fortnight.
              </div>
            ) : isMobile ? (
              <div>
                {filteredTxns.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${LINE}` }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: ACC_COLOR[t.account as keyof typeof ACC_COLOR] || MUTE, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description || catLabel(t.category_key)}</div>
                      <div style={{ fontSize: 11, color: MUTE, marginTop: 1 }}>
                        {(t.date || "").slice(5)} · {catLabel(t.category_key)} · {t.account}
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{AUD(Number(t.amount), 2)}</span>
                    <button onClick={() => onDelete(t)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C2B4", padding: 8, display: "flex" }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "13px 14px", background: "#F4EFE1", borderTop: `2px solid ${GOLD}`, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 700 }}>
                  <span>Total</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(filterTotal, 2)}</span>
                </div>
              </div>
            ) : (
              <div>
                {filteredTxns.map((t) => (
                  <div key={t.id} className="ledger-row" style={{ display: "grid", gridTemplateColumns: "84px 1fr 108px 120px 96px 34px", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
                    <span style={{ color: MUTE, fontVariantNumeric: "tabular-nums" }}>{(t.date || "").slice(5)}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description || <span style={{ color: "#C7C2B4" }}>—</span>}</span>
                    <span style={{ fontSize: 11.5, color: MUTE }}>{catLabel(t.category_key)}</span>
                    <span style={{ fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: ACC_COLOR[t.account as keyof typeof ACC_COLOR] || MUTE }} />
                      {t.account}
                    </span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{AUD(Number(t.amount), 2)}</span>
                    <button onClick={() => onDelete(t)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C2B4", display: "flex", justifyContent: "center" }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <div style={{ display: "grid", gridTemplateColumns: "84px 1fr 108px 120px 96px 34px", padding: "11px 14px", background: "#F4EFE1", borderTop: `2px solid ${GOLD}`, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 700 }}>
                  <span style={{ gridColumn: "1 / 5" }}>Total {txnFilter === "all" ? "(all)" : ""}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{AUD(filterTotal, 2)}</span>
                  <span />
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>By account / card</div>
            {byAccount.length === 0 ? (
              <div style={{ fontSize: 12.5, color: MUTE }}>Nothing logged for this filter.</div>
            ) : (
              byAccount.map((x) => (
                <div key={x.acc} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 13 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: ACC_COLOR[x.acc] }} />
                    {x.acc}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{AUD(x.total, 2)}</span>
                </div>
              ))
            )}
          </div>
          <div style={{ background: `linear-gradient(120deg, ${INK}, ${NAVY})`, borderRadius: 14, padding: 16, fontSize: 12, color: "#C4CDE0", lineHeight: 1.55 }}>
            Each expense auto-fills the matching line on <b style={{ color: "#E7D6A8" }}>Reconcile</b> for its fortnight, and adjusts the linked account balance on <b style={{ color: "#E7D6A8" }}>Accounts</b> — spend on Credit card increases what&apos;s owed; spend from Everyday, ANZ Plus or Holiday comes off that balance. Fun money and Cash aren&apos;t tracked balances, so those don&apos;t move anything.
          </div>
        </div>
      </div>
      {pendingDelete && <Toast message={`Deleted "${pendingDelete.desc}"`} actionLabel="Undo" onAction={onUndo} />}
    </div>
  );
}
