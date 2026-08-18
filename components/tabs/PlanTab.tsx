"use client";

import { useState } from "react";
import { Copy, RotateCcw, CalendarClock, Trash2, Plus } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { DEFAULT_PROFILE_SETTINGS } from "@/lib/defaults";
import { BORROW_MULT_LOW, BORROW_MULT_HIGH, sinkingFundTotal } from "@/lib/derive";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { AUD } from "@/lib/money";
import { NAVY, MUTE, GOLD, LINE, INK, inputStyle, selStyle } from "@/lib/theme";
import { Panel, PInput, Derived, Field } from "@/components/ui/atoms";
import type { Profile } from "@/lib/types";

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

export default function PlanTab() {
  const { profile, categories, recurringExpenses, D, updateProfile, updateCategory, addCategory, deleteCategory } = useAppData();
  const recurringFortnightTotal = sinkingFundTotal(recurringExpenses);
  const activeRecurringCount = recurringExpenses.filter((r) => r.active).length;
  const [inputs, setInputs] = useState<ProfileInputs>(() => toInputs(profile));
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

  const set = (key: keyof ProfileInputs, value: string) => setInputs((ii) => ({ ...ii, [key]: value }));

  const commitDate = (field: "pay_anchor" | "ft_start", value: string) => {
    updateProfile({ [field]: value });
    flash();
  };

  const commitNumber = (field: keyof Profile, raw: string, scale = 1) => {
    updateProfile({ [field]: (Number(raw) || 0) / scale });
    flash();
  };

  const commitCategory = (key: string, field: "label" | "a26" | "a27", raw?: string) => {
    const c = categories.find((cc) => cc.key === key);
    const v = catInputs[key];
    const label = (field === "label" ? raw : v?.label) ?? c?.label ?? "";
    const a26 = (field === "a26" ? raw : v?.a26) ?? String(c?.amount_2026 ?? 0);
    const a27 = (field === "a27" ? raw : v?.a27) ?? String(c?.amount_2027 ?? 0);
    if (!label.trim()) return;
    updateCategory(key, { label: label.trim(), amount_2026: Number(a26) || 0, amount_2027: Number(a27) || 0 });
    flash();
  };

  const onDeleteCategory = (key: string, label: string) => {
    if (!window.confirm(`Remove "${label}" from your budget? Past transactions logged against it stay, just unlabelled going forward.`)) return;
    deleteCategory(key);
    setCatInputs((ci) => {
      const next = { ...ci };
      delete next[key];
      return next;
    });
    flash("Category removed");
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

  const restoreDefaults = async () => {
    if (
      !window.confirm("Reset the plan assumptions to the original baseline? Categories you've added stay; the standard ones are restored. Your reconciliations and balances stay.")
    )
      return;
    updateProfile(DEFAULT_PROFILE_SETTINGS);
    const existingKeys = new Set(categories.map((c) => c.key));
    for (const c of DEFAULT_CATEGORIES) {
      if (existingKeys.has(c.id)) {
        updateCategory(c.id, { label: c.label, amount_2026: c.amount2026, amount_2027: c.amount2027 });
      } else {
        await addCategory(c.label, c.amount2026, c.amount2027, c.id);
      }
    }
    setInputs(toInputs({ ...profile, ...DEFAULT_PROFILE_SETTINGS }));
    setCatInputs((ci) => ({
      ...ci,
      ...Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, { label: c.label, a26: String(c.amount2026), a27: String(c.amount2027) }])),
    }));
    flash("Baseline restored");
  };

  const copyForClaude = async () => {
    const lines = [
      "Updated plan assumptions:",
      `Salary package (incl super): $${profile.package}`,
      `Super rate: ${(profile.super_rate * 100).toFixed(1)}%`,
      `Part-time fraction: ${(profile.pt_fraction * 100).toFixed(0)}%`,
      `First pay period starts: ${profile.pay_anchor}`,
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Budget assumptions</div>
          <div style={{ fontSize: 12.5, color: MUTE }}>
            Edit these and the whole app recalculates. {flashMsg && <b style={{ color: GOLD }}>{flashMsg}</b>}
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
            <PInput
              label="First pay period starts"
              type="date"
              value={profile.pay_anchor}
              onChange={(v) => commitDate("pay_anchor", v)}
            />
            <PInput label="Full-time from" type="date" value={profile.ft_start} onChange={(v) => commitDate("ft_start", v)} />
            <Derived
              rows={[
                ["Net pay / fortnight (FT)", AUD(D.netFTfn)],
                ["Net pay / fortnight (PT)", AUD(D.netPTfn)],
                ["Super / fortnight (FT)", AUD(D.superFTfn)],
              ]}
            />
          </Panel>
          <Panel title="Employment & tax">
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
          <Panel title="Borrowing capacity">
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
        <div style={{ flex: "1 1 380px" }}>
          <Panel title="Monthly expenses">
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 26px", gap: 6, alignItems: "center", marginBottom: 4 }}>
              <span />
              <span style={{ fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", textAlign: "right" }}>2026 (now)</span>
              <span style={{ fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", textAlign: "right" }}>2027 +</span>
              <span />
            </div>
            {categories.map((c) => (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 26px", gap: 6, alignItems: "center", padding: "3px 0" }}>
                <input
                  type="text"
                  value={catInputs[c.key]?.label ?? c.label}
                  onChange={(e) => setCatInputs((ci) => ({ ...ci, [c.key]: { label: e.target.value, a26: ci[c.key]?.a26 ?? String(c.amount_2026), a27: ci[c.key]?.a27 ?? String(c.amount_2027) } }))}
                  onBlur={(e) => commitCategory(c.key, "label", e.target.value)}
                  style={{ ...inputStyle, textAlign: "left", fontSize: 13 }}
                />
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
                <button
                  onClick={() => onDeleteCategory(c.key, catInputs[c.key]?.label ?? c.label)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C2B4", display: "flex", justifyContent: "center" }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 26px", gap: 6, marginTop: 8, paddingTop: 8, borderTop: `2px solid ${GOLD}`, fontWeight: 700, fontFamily: "var(--font-space-grotesk), sans-serif", fontVariantNumeric: "tabular-nums" }}>
              <span>Total / mo</span>
              <span style={{ textAlign: "right" }}>{AUD(D.expMo(2026))}</span>
              <span style={{ textAlign: "right" }}>{AUD(D.expMo(2027))}</span>
              <span />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 26px", gap: 6, marginTop: 4, fontSize: 12, color: MUTE, fontVariantNumeric: "tabular-nums" }}>
              <span>Per fortnight</span>
              <span style={{ textAlign: "right" }}>{AUD(D.expFN(2026))}</span>
              <span style={{ textAlign: "right" }}>{AUD(D.expFN(2027))}</span>
              <span />
            </div>
            {activeRecurringCount > 0 && (
              <div style={{ marginTop: 12, padding: "10px 12px", background: "#F4EFE1", borderRadius: 8, fontSize: 12, color: NAVY, lineHeight: 1.5 }}>
                Plus <b>{AUD(recurringFortnightTotal, 2)}/fn</b> set aside for {activeRecurringCount} recurring bill{activeRecurringCount === 1 ? "" : "s"} on{" "}
                <b>Expenses</b> (rego, insurance, subscriptions) — not counted in the totals above, so check nothing&apos;s budgeted in both
                places at once.
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
              Enter monthly figures; the rec converts them to a fortnightly budget (× 12 ÷ 26). New categories start at $0/$0 —
              set their amounts above once added. Editing here won&apos;t touch your Excel — use{" "}
              <b style={{ color: NAVY }}>Copy figures for Claude</b> to resync it.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
