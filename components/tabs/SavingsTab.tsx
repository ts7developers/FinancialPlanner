"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { TrendingUp, Sparkles, Home, CreditCard, Target, Trash2 } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { useToast } from "@/components/ToastProvider";
import { useIsMobile } from "@/lib/useIsMobile";
import { currentPeriod, isoFromDate } from "@/lib/period";
import {
  buildNetWorthProjection,
  netWorthPositiveAt,
  SALARY_SCENARIOS,
  fhssSummary,
  buildFortnightSplit,
  periodsToTarget,
  creditCardPayoffPeriod,
  adaptiveCategoryRates,
  adaptiveExpenseTotal,
  withAdaptiveExpenses,
  buildBalanceHistory,
  DEFAULT_FHSS_DEEMED_RATE,
  resolveAllocationOrder,
  dueDateGoalNeed,
} from "@/lib/derive";
import { AUD } from "@/lib/money";
import { MUTE_ICON, ON_ACCENT_DARK, SURFACE_SUBTLE, WARN_BG, WARN_TEXT, CARD, LINE, MUTE, GOLD, NAVY, FAV, UNFAV, ACCOUNTS, selStyle } from "@/lib/theme";
import { Metric, Field, Progress } from "@/components/ui/atoms";
import ChartSkeleton from "@/components/charts/ChartSkeleton";
import type { NetWorthChartRow } from "@/components/charts/NetWorthChart";

const NetWorthChart = dynamic(() => import("@/components/charts/NetWorthChart"), { ssr: false, loading: () => <ChartSkeleton height={300} /> });
const BalanceHistoryChart = dynamic(() => import("@/components/charts/BalanceHistoryChart"), { ssr: false, loading: () => <ChartSkeleton height={260} /> });

const HORIZON_PERIODS = 78; // roughly 3 years of fortnights

export default function SavingsTab() {
  const isMobile = useIsMobile();
  const { profile, balances, periods, categories, superContributions, goals, updateGoal, deleteGoal, undoDeleteGoal, accounts, addAccount, deleteAccount, loggedByCat, reconciliations, snapshots, D } = useAppData();
  const toast = useToast();
  const [goalAmountInputs, setGoalAmountInputs] = useState<Record<string, string>>({});
  const [goalFlash, setGoalFlash] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [growthPct, setGrowthPct] = useState("7");
  const [extraFn, setExtraFn] = useState("0");
  const [hecsIndexPct, setHecsIndexPct] = useState("3");
  const [scenarioId, setScenarioId] = useState("standard");
  const [deemedRate, setDeemedRate] = useState(String(DEFAULT_FHSS_DEEMED_RATE));

  const scenario = SALARY_SCENARIOS.find((s) => s.id === scenarioId) ?? SALARY_SCENARIOS[0];
  const comparisonScenario = SALARY_SCENARIOS.find((s) => s.id !== scenarioId) ?? SALARY_SCENARIOS[0];

  const today = isoFromDate(new Date());
  const goalsBalanceTotal = goals.reduce((s, g) => s + (Number(g.current_amount) || 0), 0);
  const currentYear = currentPeriod(periods, today).year;
  const adaptiveRates = adaptiveCategoryRates(categories, D, currentYear, periods, loggedByCat, reconciliations, 3);
  const adaptiveCategories = adaptiveRates.filter((r) => r.adaptive);
  const adaptiveD = withAdaptiveExpenses(D, currentYear, adaptiveExpenseTotal(adaptiveRates));
  const points = buildNetWorthProjection(profile, adaptiveD, balances, goals, periods, today, Number(growthPct) || 0, Number(extraFn) || 0, scenario, Number(hecsIndexPct) || 0, HORIZON_PERIODS);
  const comparisonPoints = buildNetWorthProjection(
    profile,
    adaptiveD,
    balances,
    goals,
    periods,
    today,
    Number(growthPct) || 0,
    Number(extraFn) || 0,
    comparisonScenario,
    Number(hecsIndexPct) || 0,
    HORIZON_PERIODS
  );

  const chartRows: NetWorthChartRow[] = points.map((p, i) => ({
    label: p.label,
    liquid: p.liquid,
    invested: p.invested,
    netWorth: p.netWorth,
    netWorthComparison: comparisonPoints[i].netWorth,
  }));

  const in1yr = points[Math.min(25, points.length - 1)];
  const in3yr = points[points.length - 1];
  const positiveAt = netWorthPositiveAt(points);
  const netWorthToday = (balances.emergency || 0) + (balances.anzplus || 0) + (balances.shares || 0) + (balances.superb || 0) + goalsBalanceTotal - (balances.cc || 0) - (balances.hecs || 0);
  const horizonYears = Math.round((HORIZON_PERIODS * 14) / 365);

  const fhss = fhssSummary(
    superContributions.map((c) => ({ date: c.date, amount: c.amount, taxDeductible: c.tax_deductible })),
    today,
    Number(deemedRate) || 0,
    D.cashFT
  );
  const cashDeposit = Number(balances.anzplus) || 0;
  const combinedDeposit = cashDeposit + fhss.estimatedNetReleasable;
  const depositTarget = D.dep5;
  const depositRemaining = Math.max(0, depositTarget - combinedDeposit);

  const split = buildFortnightSplit(profile, adaptiveD, categories, balances, goals, periods, today, 10);
  const avgToDeposit = split.length > 0 ? split.reduce((s, p) => s + p.toDeposit, 0) / split.length : 0;
  const etaPeriods = periodsToTarget(combinedDeposit, depositTarget, avgToDeposit);
  const currentIdx = split.length > 0 ? periods.findIndex((p) => p.key === split[0].key) : -1;
  const etaLabel =
    etaPeriods === null
      ? `not at this rate`
      : etaPeriods === 0
        ? "already there"
        : currentIdx >= 0 && currentIdx + etaPeriods < periods.length
          ? periods[currentIdx + etaPeriods].label
          : `beyond ${Math.round(((currentIdx + etaPeriods) * 14) / 365)} years`;

  const ccBalance = Number(balances.cc) || 0;
  // Long horizon just for this ETA (a slow payoff can take a while) — separate from `split`,
  // which stays short since it also drives the averages above.
  const ccProjection = buildFortnightSplit(profile, adaptiveD, categories, balances, goals, periods, today, 52);
  const ccPayoffPoint = creditCardPayoffPeriod(ccProjection);
  const ccStuck = ccBalance > 0 && !ccPayoffPoint && ccProjection.every((p) => p.toCreditCard === 0);
  const ccEtaLabel = ccBalance <= 0 ? "nothing owing" : ccPayoffPoint ? ccPayoffPoint.label : ccStuck ? "no surplus to put toward it" : `beyond ${ccProjection.length} fortnights`;

  const goalEtaLabel = (goalId: string) => {
    const point = ccProjection.find((p) => (p.goalAllocations.find((g) => g.id === goalId)?.balance ?? 0) >= (goals.find((g) => g.id === goalId)?.target_amount ?? Infinity));
    return point ? point.label : `beyond ${ccProjection.length} fortnights`;
  };

  const flashGoalError = (err: unknown) => {
    const msg =
      err instanceof Error && err.message.includes("Could not find the table")
        ? "Goals aren't set up yet — run migration 0012_goals.sql, then try again."
        : "Something went wrong saving that goal — try again.";
    setGoalFlash(msg);
    setTimeout(() => setGoalFlash(""), 6000);
  };

  const onDeleteGoal = (id: string, label: string) => {
    deleteGoal(id, () => {
      setGoalFlash("Could not remove that goal — it's back");
      setTimeout(() => setGoalFlash(""), 6000);
    });
    toast(`Removed "${label}"`, { actionLabel: "Undo", onAction: () => undoDeleteGoal(id) });
  };

  const onUpdateGoalAmount = async (id: string, value: string) => {
    try {
      await updateGoal(id, { current_amount: Number(value) || 0 });
    } catch (err) {
      flashGoalError(err);
    }
  };

  const onUpdateGoalDueDate = async (id: string, value: string) => {
    try {
      await updateGoal(id, { due_date: value || null });
    } catch (err) {
      flashGoalError(err);
    }
  };

  const onUpdateGoalAccount = async (id: string, value: string) => {
    try {
      await updateGoal(id, { account: value || null });
    } catch (err) {
      flashGoalError(err);
    }
  };

  const onAddAccount = async () => {
    if (!newAccountLabel.trim()) return;
    setAccountBusy(true);
    try {
      await addAccount(newAccountLabel);
      setNewAccountLabel("");
      setGoalFlash("");
    } catch {
      setGoalFlash("Could not add that account — run migration 0025_accounts.sql, then try again.");
      setTimeout(() => setGoalFlash(""), 6000);
    } finally {
      setAccountBusy(false);
    }
  };

  const onDeleteAccount = async (id: string) => {
    try {
      await deleteAccount(id);
    } catch {
      setGoalFlash("Could not remove that account — try again.");
      setTimeout(() => setGoalFlash(""), 6000);
    }
  };

  // Goals display in actual funding order: due-date goals first (soonest due date first — they're
  // always funded ahead of the percentage split), then everything else in the Pay split tab's
  // percentage order, rather than each goal's own now-secondary `priority` field.
  const percentGoals = goals.filter((g) => !g.due_date);
  const dueDateGoalsSorted = goals
    .filter((g) => g.due_date)
    .slice()
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const percentGoalOrder = resolveAllocationOrder(profile.allocation_order, percentGoals)
    .flat()
    .map((t) => t.id);
  const goalRank = (id: string) => {
    const dueIdx = dueDateGoalsSorted.findIndex((g) => g.id === id);
    if (dueIdx !== -1) return dueIdx;
    const idx = percentGoalOrder.indexOf(id);
    return dueDateGoalsSorted.length + (idx === -1 ? percentGoalOrder.length : idx);
  };

  const balanceHistory = buildBalanceHistory(snapshots, periods);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 18 }}>Savings projection</div>
        <div style={{ fontSize: 12.5, color: MUTE, marginTop: 2 }}>
          Where your planned surplus, super contributions and an assumed investment return put your net worth over the next few years.
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15 }}>
            <Home size={16} color={GOLD} /> House deposit
          </div>
          <div style={{ fontSize: 12, color: MUTE }}>cash + FHSS, vs your 5% target</div>
        </div>
        <Progress label="Combined deposit" value={combinedDeposit} target={depositTarget} colorFrom={FAV} />
        <div style={{ display: "flex", gap: 20, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}`, fontSize: 12.5, flexWrap: "wrap" }}>
          <span style={{ color: MUTE }}>
            Cash (ANZ Plus) <b style={{ color: NAVY }}>{AUD(cashDeposit)}</b>
          </span>
          <span style={{ color: MUTE }}>
            FHSS net releasable <b style={{ color: NAVY }}>{AUD(fhss.estimatedNetReleasable)}</b>
          </span>
          <span style={{ color: MUTE }}>
            Still needed <b style={{ color: depositRemaining > 0 ? UNFAV : FAV }}>{AUD(depositRemaining)}</b>
          </span>
          <span style={{ color: MUTE }}>
            At current rate <b style={{ color: NAVY }}>{etaLabel}</b>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 14 }}>
          <Field label="FHSS deemed rate (% p.a.)">
            <input type="number" inputMode="decimal" value={deemedRate} onChange={(e) => setDeemedRate(e.target.value)} style={{ ...selStyle, width: 90, textAlign: "right" }} />
          </Field>
        </div>
        <div style={{ fontSize: 11, color: MUTE, marginTop: 10, lineHeight: 1.5 }}>
          Your voluntary super contributions count toward this deposit through the First Home Super Saver scheme —
          see <b style={{ color: NAVY }}>Super</b> for the full FHSS breakdown. &ldquo;At current rate&rdquo; uses your
          average planned deposit contribution over the next {split.length} fortnights — see the fortnight-by-fortnight
          breakdown on <b style={{ color: NAVY }}>Income</b>. Estimate only — not financial advice.
        </div>
      </div>

      {ccBalance > 0 && (
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15 }}>
              <CreditCard size={16} color={UNFAV} /> Credit card
            </div>
            <div style={{ fontSize: 12, color: MUTE }}>paid down first, before emergency fund or deposit</div>
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 12.5 }}>
            <span style={{ color: MUTE }}>
              Owing <b style={{ color: UNFAV }}>{AUD(ccBalance)}</b>
            </span>
            <span style={{ color: MUTE }}>
              Paid off by <b style={{ color: NAVY }}>{ccEtaLabel}</b>
            </span>
          </div>
          <div style={{ fontSize: 11, color: MUTE, marginTop: 10, lineHeight: 1.5 }}>
            Every fortnight&apos;s leftover surplus goes here first — see the &ldquo;→ CC&rdquo; column in the fortnight-by-fortnight
            breakdown on <b style={{ color: NAVY }}>Income</b>. Feeds into the net worth projection below too, so paying it off
            faster (or slower, if expenses run high) shows up there directly.
          </div>
        </div>
      )}

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15 }}>
            <Target size={16} color={GOLD} /> Goals
          </div>
          <div style={{ fontSize: 12, color: MUTE }}>
            funded by a due date, or a <Link href="/pay-split" style={{ color: NAVY, fontWeight: 600 }}>Pay split</Link> percentage
          </div>
        </div>
        {goalFlash && (
          <div style={{ background: WARN_BG, color: WARN_TEXT, borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>{goalFlash}</div>
        )}
        {goals.length === 0 ? (
          <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 14 }}>
            Nothing set up yet — add a trip, a car, or any other savings target and it&apos;ll get its own slice of fortnightly surplus.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 14 }}>
            {goals
              .slice()
              .sort((a, b) => goalRank(a.id) - goalRank(b.id))
              .map((g) => {
                const need = g.due_date ? dueDateGoalNeed(g, today) : 0;
                return (
                  <div key={g.id}>
                    <Progress label={g.label} value={Number(g.current_amount) || 0} target={Number(g.target_amount) || 0} colorFrom={GOLD} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, color: MUTE }}>
                        {g.due_date ? (
                          need > 0 ? (
                            <>
                              Needs <b style={{ color: GOLD }}>{AUD(need)}/fortnight</b> to hit it by {g.due_date}
                            </>
                          ) : (
                            <b style={{ color: FAV }}>Target met</b>
                          )
                        ) : (
                          <>
                            At current rate, funded by <b style={{ color: NAVY }}>{goalEtaLabel(g.id)}</b>
                          </>
                        )}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                        <input
                          type="date"
                          value={g.due_date ?? ""}
                          onChange={(e) => onUpdateGoalDueDate(g.id, e.target.value)}
                          title="Fund this goal by a due date instead of a Pay split percentage — e.g. rego or car insurance"
                          style={{ ...selStyle, width: 132, fontSize: 12 }}
                        />
                        <select
                          value={g.account ?? ""}
                          onChange={(e) => onUpdateGoalAccount(g.id, e.target.value)}
                          title="Which real account this goal's money lives in"
                          style={{ ...selStyle, width: 110, fontSize: 12 }}
                        >
                          <option value="">Account…</option>
                          {ACCOUNTS.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                          {accounts.map((a) => (
                            <option key={a.id} value={a.label}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          inputMode="decimal"
                          value={goalAmountInputs[g.id] ?? String(g.current_amount)}
                          onChange={(e) => setGoalAmountInputs((gi) => ({ ...gi, [g.id]: e.target.value }))}
                          onBlur={(e) => onUpdateGoalAmount(g.id, e.target.value)}
                          title="Update how much you've actually saved toward this goal"
                          style={{ ...selStyle, width: 90, textAlign: "right", fontSize: 12 }}
                        />
                        <button onClick={() => onDeleteGoal(g.id, g.label)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTE_ICON, display: "flex" }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
        <div style={{ fontSize: 11, color: MUTE, marginTop: 4, lineHeight: 1.5 }}>
          Each goal is its own virtual balance — update &ldquo;saved so far&rdquo; directly as you set money aside for it. Pick which real account
          that money lives in (or add a custom one below), and give a goal a due date (rego, car insurance) to fund it by a fixed $/fortnight need
          instead of a <Link href="/pay-split" style={{ color: NAVY, fontWeight: 600 }}>Pay split</Link> percentage — due-date goals are funded
          first, ahead of every percentage destination. Clear the date to switch it back to a percentage share.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>Custom accounts</div>
          {accounts.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {accounts.map((a) => (
                <span
                  key={a.id}
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: NAVY, background: SURFACE_SUBTLE, border: `1px solid ${LINE}`, borderRadius: 20, padding: "4px 6px 4px 10px" }}
                >
                  {a.label}
                  <button onClick={() => onDeleteAccount(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTE_ICON, display: "flex" }}>
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              placeholder="e.g. ANZ Plus — Rego savings"
              value={newAccountLabel}
              onChange={(e) => setNewAccountLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddAccount()}
              style={{ ...selStyle, width: 220, textAlign: "left" }}
            />
            <button
              onClick={onAddAccount}
              disabled={accountBusy || !newAccountLabel.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: NAVY, border: `1px solid ${LINE}`, borderRadius: 8, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", height: 36 }}
            >
              + Add account
            </button>
          </div>
          <div style={{ fontSize: 11, color: MUTE, lineHeight: 1.5 }}>
            Beyond the built-in accounts (Everyday, ANZ Plus, Credit card, etc.), add a named one here — e.g. a dedicated sub-account for a
            specific goal — then pick it above. Just a label for your own reference; it doesn&apos;t track its own balance.
          </div>
        </div>
      </div>

      {adaptiveCategories.length > 0 && (
        <div style={{ background: WARN_BG, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: WARN_TEXT }}>
            This projection uses recent actuals, not the Budget plan, for {adaptiveCategories.length} categor{adaptiveCategories.length === 1 ? "y" : "ies"}
          </div>
          <div style={{ fontSize: 11.5, color: WARN_TEXT, marginBottom: 8, lineHeight: 1.5 }}>
            3+ fortnights running consistently over or under plan (same streak flagged on <b>Reconcile</b>) — the net worth
            projection below reacts to that instead of assuming the old plan number forever.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
            {adaptiveCategories.map((r) => (
              <span key={r.id} style={{ fontSize: 12, color: WARN_TEXT }}>
                {r.label} <span style={{ color: "#B87A69" }}>plan {AUD(r.planRate)}</span> → <b>{AUD(r.effectiveRate)}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
          <Sparkles size={16} color={GOLD} /> Assumptions
        </div>
        <Field label="Salary scenario">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SALARY_SCENARIOS.map((s) => {
              const on = s.id === scenarioId;
              return (
                <button
                  key={s.id}
                  onClick={() => setScenarioId(s.id)}
                  style={{
                    background: on ? GOLD : SURFACE_SUBTLE,
                    color: on ? ON_ACCENT_DARK : NAVY,
                    border: "none",
                    borderRadius: 999,
                    padding: "7px 14px",
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </Field>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14 }}>
          <Field label="Investment growth (% p.a.)">
            <input type="number" inputMode="decimal" value={growthPct} onChange={(e) => setGrowthPct(e.target.value)} style={{ ...selStyle, width: 90, textAlign: "right" }} />
          </Field>
          <Field label="HECS indexation (% p.a.)">
            <input type="number" inputMode="decimal" value={hecsIndexPct} onChange={(e) => setHecsIndexPct(e.target.value)} style={{ ...selStyle, width: 90, textAlign: "right" }} />
          </Field>
          <Field label="Extra savings / fortnight">
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ color: MUTE, fontSize: 13 }}>$</span>
              <input type="number" inputMode="decimal" value={extraFn} onChange={(e) => setExtraFn(e.target.value)} style={{ ...selStyle, width: 90, textAlign: "right" }} />
            </div>
          </Field>
        </div>
        <div style={{ fontSize: 11, color: MUTE, marginTop: 10, lineHeight: 1.5 }}>
          &ldquo;Standard accountant progression&rdquo; compounds your package ~9% p.a. for the first 5 years (typical AU
          graduate-to-intermediate accountant growth, per SEEK/Hays salary guides) then ~3.5% p.a. after — a rough
          guide, not a guarantee. HECS reduces via the real compulsory-repayment schedule (marginal rates above
          $69,528 repayment income) and indexes at the rate above. Credit card is paid down first, against its full balance, same as
          the fortnight-by-fortnight waterfall on Income. Shares and super compound at the investment-growth rate;
          super also keeps its usual employer contribution. Not financial advice.
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Metric icon={TrendingUp} label="Net worth today" value={AUD(netWorthToday)} sub={netWorthToday < 0 ? "normal early on — it climbs" : "already positive"} />
        <Metric icon={TrendingUp} label="Projected in 1 year" value={AUD(in1yr.netWorth)} sub={`${AUD(in1yr.netWorth - netWorthToday)} change`} accent={FAV} />
        <Metric icon={TrendingUp} label={`Projected in ${horizonYears} years`} value={AUD(in3yr.netWorth)} sub={`${AUD(in3yr.netWorth - netWorthToday)} change`} accent={FAV} />
        <Metric
          icon={TrendingUp}
          label="Net worth turns positive"
          value={positiveAt ?? "—"}
          sub={positiveAt ? "at this rate" : `not within ${horizonYears} years`}
        />
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 18px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Net worth over time</div>
          <div style={{ fontSize: 12, color: MUTE }}>gold = {scenario.label.toLowerCase()} · dashed = {comparisonScenario.label.toLowerCase()}</div>
        </div>
        <NetWorthChart data={chartRows} comparisonLabel={comparisonScenario.label} isMobile={isMobile} />
        <div style={{ fontSize: 11.5, color: MUTE, padding: "2px 0 12px" }}>
          Starts from your current balances on <b style={{ color: NAVY }}>Accounts</b>, not the original plan baseline — so it reflects where you actually are today.
        </div>
      </div>

      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 18px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
          <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Balance history</div>
          <div style={{ fontSize: 12, color: MUTE }}>from your Accounts snapshots</div>
        </div>
        {balanceHistory.length < 2 ? (
          <div style={{ padding: "24px 0 32px", fontSize: 13, color: MUTE, textAlign: "center" }}>
            Take at least two snapshots on <Link href="/accounts" style={{ color: NAVY, fontWeight: 600 }}>Accounts</Link> to see the deposit, emergency fund,
            credit card and HECS balances trend over time.
          </div>
        ) : (
          <BalanceHistoryChart data={balanceHistory} isMobile={isMobile} />
        )}
        <div style={{ fontSize: 11.5, color: MUTE, padding: "2px 0 12px" }}>
          The only history this app keeps of your actual credit card and HECS balances — everywhere else only shows the current figure.
        </div>
      </div>
    </div>
  );
}
