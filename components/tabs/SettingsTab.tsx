"use client";

import { useState } from "react";
import { Copy, RotateCcw, CalendarClock, Trash2, AlertTriangle, Download } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import type { ResetDataSelections } from "@/components/AppDataProvider";
import { isoFromDate, currentPeriod, periodLabel, dayLabel, dateFromISO } from "@/lib/period";
import { DEFAULT_PROFILE_SETTINGS } from "@/lib/defaults";
import { BORROW_MULT_LOW, BORROW_MULT_HIGH, WEEKDAY_NAMES, periodEndWeekday, paydayForPeriod, paydayWeekday, offsetForPaydayWeekday } from "@/lib/derive";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { AUD } from "@/lib/money";
import { NAVY, MUTE, GOLD, LINE, UNFAV, CARD, inputStyle, selStyle } from "@/lib/theme";
import { Panel, PInput, Derived, Collapsible } from "@/components/ui/atoms";
import NotificationsPanel from "@/components/NotificationsPanel";
import type { Profile } from "@/lib/types";

const RESET_LOGGED_ITEMS: { key: keyof ResetDataSelections; label: string }[] = [
  { key: "transactions", label: "Logged expenses" },
  { key: "payslips", label: "Payslips" },
  { key: "miscIncome", label: "Misc income entries" },
  { key: "reconciliations", label: "Fortnight reconciliations (actuals & closed status)" },
  { key: "snapshots", label: "Balance snapshot history" },
  { key: "transfers", label: "Transfer log" },
  { key: "holdings", label: "Investments (holdings & buy history)" },
  { key: "superContributions", label: "Super contributions log" },
  { key: "balances", label: "Account balances — resets every balance to $0" },
];

const RESET_SETUP_ITEMS: { key: keyof ResetDataSelections; label: string }[] = [
  { key: "recurringExpenses", label: "Recurring bills — deletes them entirely (rego, insurance, subscriptions, etc.)" },
  { key: "budgetCategories", label: "Budget categories — restores the built-in ones to baseline amounts" },
  { key: "profileSettings", label: "Profile settings (pay cycle, tax, targets) — resets to app defaults" },
];

const RESET_LABELS: Record<keyof ResetDataSelections, string> = {
  transactions: "logged expenses",
  payslips: "payslips",
  miscIncome: "misc income entries",
  reconciliations: "reconciliations",
  snapshots: "balance snapshot history",
  transfers: "transfer log",
  holdings: "investments",
  superContributions: "super contributions log",
  balances: "account balances (reset to $0)",
  goalsProgress: "goal progress (reset to $0)",
  goalsDelete: "goals (deleted entirely)",
  recurringExpenses: "recurring bills (deleted)",
  budgetCategories: "budget categories (restored to baseline)",
  profileSettings: "profile settings (restored to defaults)",
};

const EMPTY_RESET_SELECTIONS: ResetDataSelections = {
  transactions: false,
  payslips: false,
  miscIncome: false,
  reconciliations: false,
  snapshots: false,
  transfers: false,
  holdings: false,
  superContributions: false,
  balances: false,
  goalsProgress: false,
  goalsDelete: false,
  recurringExpenses: false,
  budgetCategories: false,
  profileSettings: false,
};

type ProfileInputs = {
  package: string;
  sg: string;
  ptFrac: string;
  house: string;
  depPct: string;
  fhog: string;
  costs: string;
  emergency: string;
  openDeposit: string;
  taxPaidOpening: string;
  partnerIncome: string;
  incomeGrowth: string;
};

function toInputs(profile: Profile): ProfileInputs {
  return {
    package: String(profile.package),
    sg: String(profile.super_rate * 100),
    ptFrac: String(profile.pt_fraction * 100),
    house: String(profile.house_target),
    depPct: String(profile.deposit_pct * 100),
    fhog: String(profile.fhog),
    costs: String(profile.buying_costs),
    emergency: String(profile.emergency_target),
    openDeposit: String(profile.open_deposit),
    taxPaidOpening: String(profile.tax_paid_opening),
    partnerIncome: String(profile.partner_income),
    incomeGrowth: String(profile.income_growth_pct),
  };
}

export default function SettingsTab() {
  const {
    profile,
    categories,
    periods,
    D,
    updateProfile,
    updateCategory,
    addCategory,
    resetData,
    transactions,
    reconciliations,
    snapshots,
    balances,
    payslips,
    transfers,
    holdings,
    holdingLots,
    superContributions,
    recurringExpenses,
    miscIncome,
    goals,
  } = useAppData();
  const [inputs, setInputs] = useState<ProfileInputs>(() => toInputs(profile));
  const [flashMsg, setFlashMsg] = useState("");

  const flash = (m = "Saved") => {
    setFlashMsg(m);
    setTimeout(() => setFlashMsg(""), 1300);
  };

  const set = (key: keyof ProfileInputs, value: string) => setInputs((ii) => ({ ...ii, [key]: value }));

  const commitDate = async (field: "pay_anchor" | "ft_start", value: string) => {
    try {
      await updateProfile({ [field]: value });
      flash();
    } catch {
      flash("Could not save that");
    }
  };

  // Every fortnight is exactly 14 days, so it always ends on the same weekday — that fixes a
  // one-to-one mapping between "which weekday am I paid on" and the stored day-offset, letting
  // the settings UI ask the natural question instead of an abstract number of days.
  const endWeekday = periodEndWeekday(periods);
  // Falls back to 2 (this app's real-world default) until migration 0018 has been run and the
  // column actually exists — otherwise this is `undefined` and every weekday computation below is NaN.
  const paydayOffsetDays = profile.payday_offset_days ?? 2;
  const currentPaydayWeekday = paydayWeekday(endWeekday, paydayOffsetDays);
  const today = isoFromDate(new Date());
  const examplePeriod = periods.length > 0 ? currentPeriod(periods, today) : null;

  const commitPaydayWeekday = async (weekday: number) => {
    try {
      await updateProfile({ payday_offset_days: offsetForPaydayWeekday(endWeekday, weekday) });
      flash();
    } catch {
      flash("Could not save that");
    }
  };

  const commitNumber = async (field: keyof Profile, raw: string, scale = 1) => {
    try {
      await updateProfile({ [field]: (Number(raw) || 0) / scale });
      flash();
    } catch {
      flash("Could not save that");
    }
  };

  const restoreDefaults = async () => {
    if (
      !window.confirm("Reset the plan assumptions to the original baseline? Categories you've added stay; the standard ones are restored. Your reconciliations and balances stay.")
    )
      return;
    try {
      await updateProfile(DEFAULT_PROFILE_SETTINGS);
      const existingKeys = new Set(categories.map((c) => c.key));
      for (const c of DEFAULT_CATEGORIES) {
        if (existingKeys.has(c.id)) {
          await updateCategory(c.id, { label: c.label, amount_2026: c.amount2026, amount_2027: c.amount2027, frequency: c.frequency });
        } else {
          await addCategory(c.label, c.amount2026, c.amount2027, c.id, c.frequency);
        }
      }
      setInputs(toInputs({ ...profile, ...DEFAULT_PROFILE_SETTINGS }));
      flash("Baseline restored");
    } catch {
      flash("Could not restore the baseline — some changes may be partial");
    }
  };

  const [resetSel, setResetSel] = useState<ResetDataSelections>(EMPTY_RESET_SELECTIONS);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");

  const toggleReset = (key: keyof ResetDataSelections) =>
    setResetSel((s) => {
      const next = { ...s, [key]: !s[key] };
      // Deleting a goal outright makes "reset its progress" meaningless — keep only one active.
      if (key === "goalsDelete" && next.goalsDelete) next.goalsProgress = false;
      if (key === "goalsProgress" && next.goalsProgress) next.goalsDelete = false;
      return next;
    });

  const resetSelectedKeys = (Object.keys(resetSel) as (keyof ResetDataSelections)[]).filter((k) => resetSel[k]);
  const resetAnySelected = resetSelectedKeys.length > 0;
  const resetCanConfirm = resetAnySelected && resetConfirmText.trim().toUpperCase() === "RESET";

  const onResetConfirm = async () => {
    if (!resetCanConfirm) return;
    const summary = resetSelectedKeys.map((k) => RESET_LABELS[k]).join(", ");
    if (!window.confirm(`This permanently deletes: ${summary}.\n\nThis can't be undone. Continue?`)) return;
    setResetBusy(true);
    setResetError("");
    try {
      await resetData(resetSel); // reloads the page on success — no further local cleanup needed
    } catch {
      setResetError("Could not reset — nothing was changed. Try again.");
      setResetBusy(false);
    }
  };

  const copyForClaude = async () => {
    const lines = [
      "Updated plan assumptions:",
      `Salary package (incl super): $${profile.package}`,
      `Super rate: ${(profile.super_rate * 100).toFixed(1)}%`,
      `Part-time fraction: ${(profile.pt_fraction * 100).toFixed(0)}%`,
      `A fortnight starts on: ${profile.pay_anchor}`,
      `Paid on: ${WEEKDAY_NAMES[currentPaydayWeekday]} (${paydayOffsetDays} day${paydayOffsetDays === 1 ? "" : "s"} after each fortnight ends)`,
      `Full-time from: ${profile.ft_start}`,
      `House target: $${profile.house_target}`,
      `Deposit %: ${(profile.deposit_pct * 100).toFixed(1)}%`,
      `FHOG: $${profile.fhog}`,
      `Buying costs: $${profile.buying_costs}`,
      `Emergency target: $${profile.emergency_target}`,
      `Opening deposit: $${profile.open_deposit}`,
      `Tax paid so far this FY: $${profile.tax_paid_opening}`,
      `Partner's annual income: $${profile.partner_income}`,
      `Assumed annual raise: ${profile.income_growth_pct}%`,
      "Monthly expenses (2026 / 2027):",
      ...categories.map((c) => `  ${c.label}: $${c.amount_2026} / $${c.amount_2027}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      flash("Copied — paste to Claude to resync Excel");
    } catch {
      flash("Copy failed");
    }
  };

  // Everything the app tracks, straight from what's already loaded in memory — no extra fetch
  // needed. A plain JSON dump rather than anything fancier: the point is a safety net you can
  // keep somewhere before using "Start fresh" below, not a re-importable backup format.
  const onExportData = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      categories,
      transactions,
      reconciliations,
      snapshots,
      balances,
      payslips,
      transfers,
      holdings,
      holdingLots,
      superContributions,
      recurringExpenses,
      miscIncome,
      goals,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-plan-backup-${isoFromDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash("Downloaded");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Settings</div>
          <div style={{ fontSize: 12.5, color: MUTE }}>
            Pay cycle, tax, targets, and the plan reset tools. Category amounts live on <b style={{ color: NAVY }}>Budget</b>.{" "}
            {flashMsg && <b style={{ color: GOLD }}>{flashMsg}</b>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={copyForClaude}
            style={{ display: "flex", alignItems: "center", gap: 6, background: NAVY, color: "#fff", border: "none", borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-space-grotesk), sans-serif" }}
          >
            <Copy size={14} /> Copy figures for Claude
          </button>
          <button
            onClick={restoreDefaults}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: MUTE, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <RotateCcw size={14} /> Restore baseline
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 18 }}>
          <Panel title="Pay cycle" icon={CalendarClock}>
            <PInput label="A fortnight starts on" type="date" value={profile.pay_anchor} onChange={(v) => commitDate("pay_anchor", v)} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "5px 0" }}>
              <span style={{ fontSize: 13 }}>Paid on</span>
              <select value={currentPaydayWeekday} onChange={(e) => commitPaydayWeekday(Number(e.target.value))} style={{ ...selStyle, width: 150 }}>
                {WEEKDAY_NAMES.map((name, idx) => (
                  <option key={name} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {examplePeriod && (
              <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2, marginBottom: 8, lineHeight: 1.5 }}>
                Fortnights run {dayLabel(examplePeriod.start)} – {dayLabel(examplePeriod.end)}, every 14 days. Since a fortnight always ends on{" "}
                {WEEKDAY_NAMES[endWeekday]}, picking a payday weekday above fixes how many days after that your pay lands — e.g. this fortnight (
                {periodLabel(examplePeriod)}) pays out {dayLabel(dateFromISO(paydayForPeriod(examplePeriod, paydayOffsetDays)))}.
              </div>
            )}
            <PInput label="Full-time from" type="date" value={profile.ft_start} onChange={(v) => commitDate("ft_start", v)} />
            <Derived
              rows={[
                ["Net pay / fortnight (FT)", AUD(D.netFTfn)],
                ["Net pay / fortnight (PT)", AUD(D.netPTfn)],
                ["Super / fortnight (FT)", AUD(D.superFTfn)],
              ]}
            />
          </Panel>
          <Panel title="Employment & tax" collapsible defaultOpen={false}>
            <PInput label="Salary package (incl. super)" prefix="$" value={inputs.package} onChange={(v) => set("package", v)} onBlur={() => commitNumber("package", inputs.package)} />
            <PInput label="Super rate" suffix="%" value={inputs.sg} onChange={(v) => set("sg", v)} onBlur={() => commitNumber("super_rate", inputs.sg, 100)} />
            <PInput label="Part-time fraction" suffix="%" value={inputs.ptFrac} onChange={(v) => set("ptFrac", v)} onBlur={() => commitNumber("pt_fraction", inputs.ptFrac, 100)} />
            <PInput
              label="Tax paid so far this FY (opening balance)"
              prefix="$"
              value={inputs.taxPaidOpening}
              onChange={(v) => set("taxPaidOpening", v)}
              onBlur={() => commitNumber("tax_paid_opening", inputs.taxPaidOpening)}
            />
            <Derived rows={[["Cash salary (FT, / yr)", AUD(D.cashFT)], ["Net pay / month (FT)", AUD(D.netFTmo)]]} />
            <div style={{ fontSize: 11.5, color: MUTE, marginTop: 10, lineHeight: 1.5 }}>
              HECS-HELP withholding uses the real ATO marginal repayment schedule automatically — no threshold to set here.
            </div>
          </Panel>
          <Panel title="Goals & house">
            <PInput label="House-and-land target" prefix="$" value={inputs.house} onChange={(v) => set("house", v)} onBlur={() => commitNumber("house_target", inputs.house)} />
            <PInput label="Deposit required" suffix="%" value={inputs.depPct} onChange={(v) => set("depPct", v)} onBlur={() => commitNumber("deposit_pct", inputs.depPct, 100)} />
            <PInput label="First Home Owner Grant" prefix="$" value={inputs.fhog} onChange={(v) => set("fhog", v)} onBlur={() => commitNumber("fhog", inputs.fhog)} />
            <PInput label="Other buying costs" prefix="$" value={inputs.costs} onChange={(v) => set("costs", v)} onBlur={() => commitNumber("buying_costs", inputs.costs)} />
            <PInput label="Emergency fund target" prefix="$" value={inputs.emergency} onChange={(v) => set("emergency", v)} onBlur={() => commitNumber("emergency_target", inputs.emergency)} />
            <PInput label="Opening deposit (ANZ Plus)" prefix="$" value={inputs.openDeposit} onChange={(v) => set("openDeposit", v)} onBlur={() => commitNumber("open_deposit", inputs.openDeposit)} />
            <Derived rows={[["Deposit at 5%", AUD(D.dep5)], ["Net cash to save", AUD(D.netCash)]]} />
          </Panel>
          <Panel title="Borrowing capacity" collapsible defaultOpen={false}>
            <PInput
              label="Partner's annual income"
              prefix="$"
              value={inputs.partnerIncome}
              onChange={(v) => set("partnerIncome", v)}
              onBlur={() => commitNumber("partner_income", inputs.partnerIncome)}
            />
            <PInput
              label="Assumed annual raise"
              suffix="%"
              value={inputs.incomeGrowth}
              onChange={(v) => set("incomeGrowth", v)}
              onBlur={() => commitNumber("income_growth_pct", inputs.incomeGrowth)}
            />
            <Derived
              rows={[
                ["Household cash income now", AUD(D.cashFT + (Number(profile.partner_income) || 0))],
                [
                  "Est. capacity now",
                  `${AUD((D.cashFT + (Number(profile.partner_income) || 0)) * BORROW_MULT_LOW)}–${AUD((D.cashFT + (Number(profile.partner_income) || 0)) * BORROW_MULT_HIGH)}`,
                ],
              ]}
            />
            <div style={{ fontSize: 11.5, color: MUTE, marginTop: 10, lineHeight: 1.5 }}>
              Rough guide only ({BORROW_MULT_LOW}–{BORROW_MULT_HIGH}× household cash income), not a lender
              pre-approval. See the projection on <b style={{ color: NAVY }}>Overview</b>.
            </div>
          </Panel>
        </div>
        <div style={{ flex: "1 1 380px", display: "flex", flexDirection: "column", gap: 18 }}>
          <NotificationsPanel />
          <Panel title="Backup" icon={Download}>
            <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 12, lineHeight: 1.5 }}>
              A full JSON download of everything the app tracks — every transaction, payslip, balance, goal, and setting. Worth
              grabbing one before using <b style={{ color: NAVY }}>Start fresh</b> below, or just every so often as a safety net.
            </div>
            <button
              onClick={onExportData}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: NAVY, border: `1px solid ${LINE}`, borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              <Download size={14} /> Download backup (.json)
            </button>
          </Panel>
          <Collapsible title="Start fresh" icon={AlertTriangle} defaultOpen subtitle="Tick what to wipe if you haven't been tracking accurately and want to refill it — everything else stays untouched.">
            <div style={{ padding: "0 18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: MUTE, fontWeight: 600, marginBottom: 8 }}>What you&apos;ve logged so far</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {RESET_LOGGED_ITEMS.map((item) => (
                    <label key={item.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={resetSel[item.key]} onChange={() => toggleReset(item.key)} />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: MUTE, fontWeight: 600, marginBottom: 8 }}>Goals</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={resetSel.goalsProgress} onChange={() => toggleReset("goalsProgress")} />
                    Reset goal progress to $0 (keeps the goals themselves)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                    <input type="checkbox" checked={resetSel.goalsDelete} onChange={() => toggleReset("goalsDelete")} />
                    Delete goals entirely
                  </label>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: MUTE, fontWeight: 600, marginBottom: 8 }}>Your plan/setup — only if you want a full reset</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {RESET_SETUP_ITEMS.map((item) => (
                    <label key={item.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={resetSel[item.key]} onChange={() => toggleReset(item.key)} />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ background: "#FBEDE9", border: `1px solid ${UNFAV}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12.5, color: "#8A3320", lineHeight: 1.5 }}>
                  {resetAnySelected ? `This permanently deletes: ${resetSelectedKeys.map((k) => RESET_LABELS[k]).join(", ")}. This can't be undone.` : "Tick at least one item above to enable the reset."}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder='Type "RESET" to confirm'
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    disabled={!resetAnySelected}
                    style={{ ...inputStyle, background: CARD, width: 180, opacity: resetAnySelected ? 1 : 0.6 }}
                  />
                  <button
                    onClick={onResetConfirm}
                    disabled={!resetCanConfirm || resetBusy}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: resetCanConfirm ? UNFAV : "transparent",
                      color: resetCanConfirm ? "#fff" : MUTE,
                      border: resetCanConfirm ? "none" : `1px solid ${LINE}`,
                      borderRadius: 8,
                      padding: "9px 15px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: resetCanConfirm && !resetBusy ? "pointer" : "default",
                      opacity: resetBusy ? 0.7 : 1,
                      fontFamily: "var(--font-space-grotesk), sans-serif",
                    }}
                  >
                    <Trash2 size={14} /> {resetBusy ? "Resetting…" : "Reset selected"}
                  </button>
                </div>
                {resetError && <div style={{ fontSize: 12, color: UNFAV }}>{resetError}</div>}
              </div>
            </div>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
