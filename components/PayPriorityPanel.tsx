"use client";

import { useState } from "react";
import Link from "next/link";
import { RotateCcw, ListOrdered, Plus, X, CalendarClock } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { resolveAllocationOrder, dueDateGoalNeed, EMERGENCY_ALLOCATION_ID, DEPOSIT_ALLOCATION_ID, EXTRA_BALANCE_DESTINATIONS } from "@/lib/derive";
import { isoFromDate, dateFromISO, dayLabel } from "@/lib/period";
import { AUD } from "@/lib/money";
import { GOLD_MUTE, ON_ACCENT_DARK, SURFACE_SUBTLE, LINE, MUTE, GOLD, NAVY, UNFAV, PIE_COLORS, selStyle } from "@/lib/theme";
import { Panel, Field, InfoTip } from "@/components/ui/atoms";
import type { AllocationOrder, Goal } from "@/lib/types";

function destinationLabel(id: string, goals: Goal[]): string {
  if (id === EMERGENCY_ALLOCATION_ID) return "Emergency fund";
  if (id === DEPOSIT_ALLOCATION_ID) return "House deposit";
  const extra = EXTRA_BALANCE_DESTINATIONS.find((d) => d.id === id);
  if (extra) return extra.label;
  return goals.find((g) => g.id === id)?.label ?? "(removed goal)";
}

/**
 * Lets you set what percentage share of fortnightly surplus goes to each destination — emergency
 * fund, house deposit, and every goal — all at once, instead of ranking them. Every destination
 * gets its share simultaneously; once one hits its cap (a goal's target, the emergency fund's
 * target), its leftover share redistributes to the rest automatically. Credit card paydown isn't
 * shown here: it's always the fixed first step, ahead of everything below.
 */
export default function PayPriorityPanel() {
  const { profile, goals, updateProfile, addGoal } = useAppData();
  const [busy, setBusy] = useState(false);
  const [flashMsg, setFlashMsgState] = useState("");
  const [newGoalLabel, setNewGoalLabel] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [extraToAdd, setExtraToAdd] = useState<string>(EXTRA_BALANCE_DESTINATIONS[0]?.id ?? "");

  const dueDateGoals = goals.filter((g) => g.due_date);
  const percentGoals = goals.filter((g) => !g.due_date);
  const dueDateGoalIds = new Set(dueDateGoals.map((g) => g.id));
  const today = isoFromDate(new Date());

  const order = resolveAllocationOrder(profile.allocation_order, percentGoals).filter((t) => !dueDateGoalIds.has(t.id));
  const usedIds = new Set(order.map((t) => t.id));
  const availableExtras = EXTRA_BALANCE_DESTINATIONS.filter((d) => !usedIds.has(d.id));
  const totalPct = order.reduce((s, t) => s + (Number(t.weightPct) || 0), 0);

  const flash = (m: string) => {
    setFlashMsgState(m);
    setTimeout(() => setFlashMsgState(""), 1500);
  };

  const commit = async (next: AllocationOrder) => {
    setBusy(true);
    try {
      await updateProfile({ allocation_order: next });
      flash("Saved");
    } catch {
      flash("Could not save that");
    } finally {
      setBusy(false);
    }
  };

  const setWeight = (id: string, pct: number) => {
    const clamped = Math.max(0, Number.isFinite(pct) ? pct : 0);
    commit(order.map((t) => (t.id === id ? { ...t, weightPct: clamped } : t)));
  };

  const removeDestination = (id: string) => {
    if (busy) return;
    commit(order.filter((t) => t.id !== id));
  };

  const resetToDefault = async () => {
    setBusy(true);
    try {
      await updateProfile({ allocation_order: null });
      flash("Reset to default order");
    } catch {
      flash("Could not reset that");
    } finally {
      setBusy(false);
    }
  };

  const addExtraDestination = (id: string) => {
    if (!id || busy) return;
    commit([...order, { id, weightPct: 20 }]);
  };

  const [goalBusy, setGoalBusy] = useState(false);
  const onAddGoal = async () => {
    if (!newGoalLabel.trim() || !(Number(newGoalTarget) > 0)) return;
    setGoalBusy(true);
    try {
      await addGoal(newGoalLabel, Number(newGoalTarget));
      setNewGoalLabel("");
      setNewGoalTarget("");
      flash("Goal added");
    } catch {
      flash("Could not add that goal");
    } finally {
      setGoalBusy(false);
    }
  };

  return (
    <Panel title="Pay split" icon={ListOrdered}>
      <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 12, lineHeight: 1.5 }}>
        What share of each fortnight&apos;s surplus goes to each destination, after credit card paydown (always first, fixed, against the full balance), budgeted spending, bills, and any
        due-date goals below. Percentages split proportionally, so they don&apos;t need to add up to exactly 100 — but aiming for 100 keeps it easy to reason about. Once a destination
        reaches its target, its leftover share flows to the rest automatically.
      </div>

      {dueDateGoals.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".04em" }}>
            <CalendarClock size={13} /> Due-date goals — funded before the percentages below
          </div>
          {dueDateGoals.map((g) => {
            const need = dueDateGoalNeed(g, today);
            return (
              <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", background: SURFACE_SUBTLE, border: `1px solid ${LINE}`, borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>
                  {g.label} <span style={{ fontWeight: 400, color: MUTE }}>· due {dayLabel(dateFromISO(g.due_date!))}</span>
                </span>
                <span style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums", color: need > 0 ? GOLD : MUTE }}>
                  {need > 0 ? `${AUD(need)}/fortnight` : "Target met"}
                </span>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: MUTE, lineHeight: 1.5 }}>
            Recalculated each fortnight from the remaining shortfall and time left, so it self-corrects as you contribute. Set or clear a due date on the{" "}
            <Link href="/savings" style={{ color: NAVY, fontWeight: 600 }}>Wealth</Link> tab&apos;s Goals list.
          </div>
        </div>
      )}

      {totalPct > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", border: `1px solid ${LINE}` }}>
            {order
              .filter((t) => t.weightPct > 0)
              .map((t, i) => (
                <div
                  key={t.id}
                  title={`${destinationLabel(t.id, goals)} — ${((t.weightPct / totalPct) * 100).toFixed(0)}%`}
                  style={{ width: `${(t.weightPct / totalPct) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}
                />
              ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 8 }}>
            {order
              .filter((t) => t.weightPct > 0)
              .map((t, i) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: MUTE }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                  {destinationLabel(t.id, goals)} · {((t.weightPct / totalPct) * 100).toFixed(0)}%
                </div>
              ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {order.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", background: SURFACE_SUBTLE, border: `1px solid ${LINE}`, borderRadius: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{destinationLabel(t.id, goals)}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="number"
                inputMode="decimal"
                value={t.weightPct}
                onChange={(e) => setWeight(t.id, Number(e.target.value))}
                style={{ ...selStyle, width: 64, height: 36, fontSize: 12, textAlign: "right" }}
              />
              <span style={{ color: MUTE, fontSize: 12 }}>%</span>
              {t.id !== EMERGENCY_ALLOCATION_ID && t.id !== DEPOSIT_ALLOCATION_ID && (
                <button onClick={() => removeDestination(t.id)} disabled={busy} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: GOLD_MUTE, display: "flex" }}>
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: Math.round(totalPct) === 100 ? MUTE : UNFAV, marginTop: 10, display: "flex", alignItems: "center" }}>
        Total: {totalPct.toFixed(0)}%{Math.round(totalPct) !== 100 && " — shares still split proportionally, but percentages that add to 100 are easier to read at a glance"}
        <InfoTip
          iconColor={Math.round(totalPct) === 100 ? MUTE : UNFAV}
          text="Once a destination hits its target (a goal's amount, the emergency fund's target), its share stops going there and flows to whatever's left automatically — you don't need to come back and change the percentages when that happens."
        />
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="New goal">
            <input
              type="text"
              placeholder="e.g. New car"
              value={newGoalLabel}
              onChange={(e) => setNewGoalLabel(e.target.value)}
              style={{ ...selStyle, width: 130, textAlign: "left" }}
            />
          </Field>
          <Field label="Target">
            <input
              type="number"
              inputMode="decimal"
              placeholder="$"
              value={newGoalTarget}
              onChange={(e) => setNewGoalTarget(e.target.value)}
              style={{ ...selStyle, width: 90 }}
            />
          </Field>
          <button
            onClick={onAddGoal}
            disabled={goalBusy || !newGoalLabel.trim() || !(Number(newGoalTarget) > 0)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: ON_ACCENT_DARK, border: "none", borderRadius: 8, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", height: 36, fontFamily: "var(--font-space-grotesk), sans-serif" }}
          >
            <Plus size={14} /> Add goal
          </button>
        </div>

        {availableExtras.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <Field label="Also send surplus to">
              <select value={extraToAdd} onChange={(e) => setExtraToAdd(e.target.value)} style={{ ...selStyle, width: 150 }}>
                {availableExtras.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
            <button
              onClick={() => addExtraDestination(extraToAdd)}
              disabled={busy}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: NAVY, border: `1px solid ${LINE}`, borderRadius: 8, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", height: 36 }}
            >
              <Plus size={14} /> Add
            </button>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: MUTE, marginTop: 6, lineHeight: 1.5 }}>
        A new goal or destination lands at 20% — adjust it and the others so they add up the way you want. Edit an existing goal&apos;s target or logged progress on the{" "}
        <b style={{ color: NAVY }}>Goals</b> list below.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
        <button
          onClick={resetToDefault}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: MUTE, border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" }}
        >
          <RotateCcw size={13} /> Reset to an even split
        </button>
        {flashMsg && <span style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>{flashMsg}</span>}
      </div>
    </Panel>
  );
}
