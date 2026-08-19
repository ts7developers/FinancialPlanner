"use client";

import { useState } from "react";
import { PiggyBank, Plus, Trash2, Sparkles } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { isoFromDate, financialYearStart } from "@/lib/period";
import { sumYTD, fhssSummary, FHSS_ANNUAL_CAP, FHSS_LIFETIME_CAP, DEFAULT_FHSS_DEEMED_RATE } from "@/lib/derive";
import { AUD, num } from "@/lib/money";
import { CARD, LINE, MUTE, GOLD, NAVY, FAV, selStyle, BALANCE_FIELDS } from "@/lib/theme";
import { Metric, Progress, Field } from "@/components/ui/atoms";
import type { SuperContribution, Balances } from "@/lib/types";

const TYPE_LABEL: Record<SuperContribution["type"], string> = {
  salary_sacrifice: "Salary sacrifice",
  personal: "Personal",
};

export default function SuperTab() {
  const { balances, payslips, superContributions, D, profile, updateProfile, addSuperContribution, deleteSuperContribution } = useAppData();

  const [employerExtra, setEmployerExtra] = useState(String(profile.super_employer_extra ?? 0));
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<SuperContribution["type"]>("salary_sacrifice");
  const [taxDeductible, setTaxDeductible] = useState(true);
  const [affectsBalance, setAffectsBalance] = useState(true);
  const [contribAccount, setContribAccount] = useState<keyof Omit<Balances, "user_id">>("everyday");
  const [note, setNote] = useState("");
  const [deemedRate, setDeemedRate] = useState(String(DEFAULT_FHSS_DEEMED_RATE));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flashMsg, setFlashMsg] = useState("");

  const flash = (m = "Saved") => {
    setFlashMsg(m);
    setTimeout(() => setFlashMsg(""), 1300);
  };

  const today = isoFromDate(new Date());
  const ytd = sumYTD(payslips, financialYearStart(today));
  const fhss = fhssSummary(
    superContributions.map((c) => ({ date: c.date, amount: c.amount, taxDeductible: c.tax_deductible })),
    today,
    Number(deemedRate) || 0,
    D.cashFT
  );

  const setType_ = (t: SuperContribution["type"]) => {
    setType(t);
    if (t === "salary_sacrifice") setTaxDeductible(true); // always concessional — never after-tax money
  };

  const onDelete = async (id: string) => {
    try {
      await deleteSuperContribution(id);
      flash("Contribution removed");
    } catch {
      setError("Could not remove that contribution");
    }
  };

  const onAdd = async () => {
    if (!(Number(amount) > 0)) {
      setError("Enter an amount.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await addSuperContribution(date || today, Number(amount), type, taxDeductible, affectsBalance, note || undefined, type === "personal" ? contribAccount : undefined);
      setAmount("");
      setNote("");
      flash("Contribution logged");
    } catch {
      setError("Could not save that contribution");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Super &amp; FHSS</div>
        <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>
          Track your super balance and voluntary contributions toward the First Home Super Saver scheme.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Metric icon={PiggyBank} label="Super balance" value={AUD(num(balances.superb))} sub="from Accounts" />
        <Metric
          icon={PiggyBank}
          label="Employer super (FY YTD)"
          value={AUD(ytd.super + (Number(profile.super_employer_extra) || 0))}
          sub="from payslips + other employers"
          accent={FAV}
        />
        <Metric icon={PiggyBank} label="FHSS eligible this FY" value={AUD(fhss.thisFYEligible)} sub={`of ${AUD(FHSS_ANNUAL_CAP)} cap`} />
        <Metric icon={PiggyBank} label="Est. FHSS releasable (after tax)" value={AUD(fhss.estimatedNetReleasable)} sub={`${AUD(fhss.estimatedReleasable)} before tax`} accent={FAV} />
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Other employer super</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <Field label="This FY, not from a payslip">
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ color: MUTE, fontSize: 13 }}>$</span>
              <input
                type="number"
                inputMode="decimal"
                value={employerExtra}
                onChange={(e) => setEmployerExtra(e.target.value)}
                onBlur={async () => {
                  try {
                    await updateProfile({ super_employer_extra: Number(employerExtra) || 0 });
                    flash();
                  } catch {
                    setError("Could not save that");
                  }
                }}
                style={{ ...selStyle, width: 110, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              />
            </div>
          </Field>
        </div>
        <div style={{ fontSize: 11, color: MUTE, marginTop: 10, lineHeight: 1.5 }}>
          Employer super contributions this FY that don&apos;t come through an uploaded payslip (e.g. a casual or second job) — already reflected
          in the Super balance on Accounts, so this only tops up the YTD figure above, not the balance itself.
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>FHSS caps</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Progress label="This financial year" value={fhss.thisFYTotal} target={FHSS_ANNUAL_CAP} colorFrom={FAV} />
          <Progress label="Lifetime" value={fhss.lifetimeEligible} target={FHSS_LIFETIME_CAP} />
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}`, fontSize: 12.5, flexWrap: "wrap" }}>
          <span style={{ color: MUTE }}>
            Tax-free (non-concessional) <b style={{ color: NAVY }}>{AUD(fhss.taxFreeAmount)}</b>
          </span>
          <span style={{ color: MUTE }}>
            Assessable (concessional + earnings) <b style={{ color: NAVY }}>{AUD(fhss.assessableAmount)}</b>
          </span>
          <span style={{ color: MUTE }}>
            Est. tax on release <b style={{ color: "#C0492F" }}>{AUD(fhss.estimatedTax)}</b>
          </span>
        </div>
        <div style={{ fontSize: 11, color: MUTE, marginTop: 12, lineHeight: 1.5 }}>
          Voluntary (salary-sacrifice or personal) contributions only — compulsory employer super isn&apos;t FHSS-eligible.
          Up to ${FHSS_ANNUAL_CAP.toLocaleString()} per financial year and ${FHSS_LIFETIME_CAP.toLocaleString()} lifetime count
          toward a release. Non-concessional (not tax-deducted) principal comes out tax-free; concessional principal
          plus all deemed earnings are assessable income, taxed at your marginal rate with a 30% offset — estimated
          here using your current cash salary as the base. Deemed earnings compound daily from the start of each
          contribution&apos;s month at the deemed rate below (the ATO&apos;s actual rate is the shortfall interest
          charge rate, which changes quarterly). Get your real determination from the ATO/myGov before relying on
          this. Not financial or tax advice.
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
          <Sparkles size={16} color={GOLD} /> Log a voluntary contribution
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...selStyle, width: 150 }} />
          </Field>
          <Field label="Amount">
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ color: MUTE, fontSize: 13 }}>$</span>
              <input type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...selStyle, width: 100, textAlign: "right", fontVariantNumeric: "tabular-nums" }} />
            </div>
          </Field>
          <Field label="Type">
            <select value={type} onChange={(e) => setType_(e.target.value as SuperContribution["type"])} style={{ ...selStyle, width: 160 }}>
              <option value="salary_sacrifice">Salary sacrifice</option>
              <option value="personal">Personal</option>
            </select>
          </Field>
          <Field label="Tax deduction">
            <label style={{ display: "flex", alignItems: "center", gap: 6, height: 30, fontSize: 13, color: type === "salary_sacrifice" ? MUTE : NAVY }}>
              <input
                type="checkbox"
                checked={taxDeductible}
                disabled={type === "salary_sacrifice"}
                onChange={(e) => setTaxDeductible(e.target.checked)}
              />
              Claimed
            </label>
          </Field>
          <Field label="Balance">
            <label style={{ display: "flex", alignItems: "center", gap: 6, height: 30, fontSize: 13, color: NAVY }}>
              <input type="checkbox" checked={affectsBalance} onChange={(e) => setAffectsBalance(e.target.checked)} />
              Add to Super balance
            </label>
          </Field>
          {type === "personal" && affectsBalance && (
            <Field label="Paid from">
              <select value={contribAccount} onChange={(e) => setContribAccount(e.target.value as keyof Omit<Balances, "user_id">)} style={{ ...selStyle, width: 170 }}>
                {BALANCE_FIELDS.filter(([k]) => k !== "superb").map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Note (optional)" grow>
            <input type="text" placeholder="e.g. Extra this payday" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...selStyle, width: "100%", textAlign: "left" }} />
          </Field>
          <button
            onClick={onAdd}
            disabled={busy}
            style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: NAVY, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1, fontFamily: "var(--font-space-grotesk), sans-serif", height: 36 }}
          >
            <Plus size={14} /> Add
          </button>
        </div>
        <div style={{ fontSize: 11, color: MUTE, marginTop: 8, lineHeight: 1.5 }}>
          Salary sacrifice is always concessional (pre-tax). For a personal contribution, tick &ldquo;Claimed&rdquo; only if you
          lodged (or will lodge) a notice of intent to claim it as a tax deduction — otherwise it&apos;s non-concessional and
          releases tax-free. Uncheck &ldquo;Add to Super balance&rdquo; when backfilling a contribution that&apos;s already
          reflected in your current balance on Accounts, so it doesn&apos;t get counted twice.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
          <Field label="Deemed rate (% p.a.)">
            <input type="number" inputMode="decimal" value={deemedRate} onChange={(e) => setDeemedRate(e.target.value)} style={{ ...selStyle, width: 90, textAlign: "right" }} />
          </Field>
          <div style={{ fontSize: 11, color: MUTE, lineHeight: 1.5 }}>
            Used only to estimate deemed earnings above — check the ATO&apos;s current shortfall interest charge rate for the closest figure.
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: "#C0492F", marginTop: 8 }}>{error}</div>}
        {flashMsg && <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginTop: 8 }}>{flashMsg}</div>}
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Contributions logged</div>
        {superContributions.length === 0 ? (
          <div style={{ fontSize: 13, color: MUTE }}>None yet. Log a voluntary contribution above to start tracking it toward the FHSS caps.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {superContributions.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "7px 0", borderBottom: `1px solid ${LINE}`, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: MUTE }}>
                  {c.date} · {TYPE_LABEL[c.type]} · {c.tax_deductible ? "concessional" : "non-concessional"}
                  {!c.affects_balance ? " · backfilled (not in balance)" : ""}
                  {c.note ? ` · ${c.note}` : ""}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 500 }}>{AUD(c.amount, 2)}</span>
                  <button onClick={() => onDelete(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C2B4", display: "flex" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
