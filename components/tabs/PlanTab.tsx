"use client";

import { useState } from "react";
import { Copy, RotateCcw, CalendarClock } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { DEFAULT_PROFILE_SETTINGS } from "@/lib/defaults";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { AUD } from "@/lib/money";
import { NAVY, MUTE, GOLD, LINE, inputStyle } from "@/lib/theme";
import { Panel, PInput, Derived } from "@/components/ui/atoms";
import type { Profile } from "@/lib/types";

type ProfileInputs = {
  package: string;
  sg: string;
  ptFrac: string;
  hecsThreshold: string;
  house: string;
  depPct: string;
  fhog: string;
  costs: string;
  emergency: string;
  openDeposit: string;
};

function toInputs(profile: Profile): ProfileInputs {
  return {
    package: String(profile.package),
    sg: String(profile.super_rate * 100),
    ptFrac: String(profile.pt_fraction * 100),
    hecsThreshold: String(profile.hecs_threshold),
    house: String(profile.house_target),
    depPct: String(profile.deposit_pct * 100),
    fhog: String(profile.fhog),
    costs: String(profile.buying_costs),
    emergency: String(profile.emergency_target),
    openDeposit: String(profile.open_deposit),
  };
}

export default function PlanTab() {
  const { profile, categories, D, updateProfile, updateCategory } = useAppData();
  const [inputs, setInputs] = useState<ProfileInputs>(() => toInputs(profile));
  const [catInputs, setCatInputs] = useState<Record<string, { a26: string; a27: string }>>(() =>
    Object.fromEntries(categories.map((c) => [c.key, { a26: String(c.amount_2026), a27: String(c.amount_2027) }]))
  );
  const [flashMsg, setFlashMsg] = useState("");

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

  const commitCategory = (key: string) => {
    const v = catInputs[key];
    updateCategory(key, { amount_2026: Number(v.a26) || 0, amount_2027: Number(v.a27) || 0 });
    flash();
  };

  const restoreDefaults = () => {
    if (
      !window.confirm("Reset the plan assumptions to the original WCH baseline? Your reconciliations and balances stay.")
    )
      return;
    updateProfile(DEFAULT_PROFILE_SETTINGS);
    DEFAULT_CATEGORIES.forEach((c) => updateCategory(c.id, { amount_2026: c.amount2026, amount_2027: c.amount2027 }));
    setInputs(toInputs({ ...profile, ...DEFAULT_PROFILE_SETTINGS }));
    setCatInputs(Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c.id, { a26: String(c.amount2026), a27: String(c.amount2027) }])));
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
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Plan assumptions</div>
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
            <PInput label="HECS repayment threshold" prefix="$" value={inputs.hecsThreshold} onChange={(v) => set("hecsThreshold", v)} onBlur={() => commitNumber("hecs_threshold", inputs.hecsThreshold)} />
            <Derived rows={[["Cash salary (FT, / yr)", AUD(D.cashFT)], ["Net pay / month (FT)", AUD(D.netFTmo)]]} />
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
        </div>
        <div style={{ flex: "1 1 380px" }}>
          <Panel title="Monthly expenses">
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 6, alignItems: "center", marginBottom: 4 }}>
              <span />
              <span style={{ fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", textAlign: "right" }}>2026 (now)</span>
              <span style={{ fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", textAlign: "right" }}>2027 +</span>
            </div>
            {categories.map((c) => (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 6, alignItems: "center", padding: "3px 0" }}>
                <span style={{ fontSize: 13 }}>{c.label}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={catInputs[c.key]?.a26 ?? ""}
                  onChange={(e) => setCatInputs((ci) => ({ ...ci, [c.key]: { ...ci[c.key], a26: e.target.value } }))}
                  onBlur={() => commitCategory(c.key)}
                  style={inputStyle}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  value={catInputs[c.key]?.a27 ?? ""}
                  onChange={(e) => setCatInputs((ci) => ({ ...ci, [c.key]: { ...ci[c.key], a27: e.target.value } }))}
                  onBlur={() => commitCategory(c.key)}
                  style={inputStyle}
                />
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 6, marginTop: 8, paddingTop: 8, borderTop: `2px solid ${GOLD}`, fontWeight: 700, fontFamily: "var(--font-space-grotesk), sans-serif", fontVariantNumeric: "tabular-nums" }}>
              <span>Total / mo</span>
              <span style={{ textAlign: "right" }}>{AUD(D.expMo(2026))}</span>
              <span style={{ textAlign: "right" }}>{AUD(D.expMo(2027))}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 6, marginTop: 4, fontSize: 12, color: MUTE, fontVariantNumeric: "tabular-nums" }}>
              <span>Per fortnight</span>
              <span style={{ textAlign: "right" }}>{AUD(D.expFN(2026))}</span>
              <span style={{ textAlign: "right" }}>{AUD(D.expFN(2027))}</span>
            </div>
            <div style={{ fontSize: 11.5, color: MUTE, marginTop: 10, lineHeight: 1.5 }}>
              Enter monthly figures; the rec converts them to a fortnightly budget (× 12 ÷ 26). Board and private health
              start in the 2027 column. Editing here won&apos;t touch your Excel — use{" "}
              <b style={{ color: NAVY }}>Copy figures for Claude</b> to resync it.
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
