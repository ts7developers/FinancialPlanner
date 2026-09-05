"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, Link2, Unlink, RotateCcw, ListOrdered, Plus } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { resolveAllocationOrder, EMERGENCY_ALLOCATION_ID, DEPOSIT_ALLOCATION_ID, EXTRA_BALANCE_DESTINATIONS } from "@/lib/derive";
import { LINE, MUTE, GOLD, INK, NAVY, UNFAV, selStyle } from "@/lib/theme";
import { Panel, Field } from "@/components/ui/atoms";
import type { AllocationOrder, Goal } from "@/lib/types";

function destinationLabel(id: string, goals: Goal[]): string {
  if (id === EMERGENCY_ALLOCATION_ID) return "Emergency fund";
  if (id === DEPOSIT_ALLOCATION_ID) return "House deposit";
  const extra = EXTRA_BALANCE_DESTINATIONS.find((d) => d.id === id);
  if (extra) return extra.label;
  return goals.find((g) => g.id === id)?.label ?? "(removed goal)";
}

/**
 * Lets you rank where fortnightly surplus goes — emergency fund, house deposit, and every goal —
 * instead of the fixed "emergency, then goals by priority, then deposit" order. Adjacent solo
 * rows can be tied together to split the surplus between them (e.g. 50/50) instead of fully
 * funding one before the other starts. Credit card paydown isn't shown here: it's always the
 * fixed first step, ahead of everything below.
 */
export default function PayPriorityPanel() {
  const { profile, goals, updateProfile, addGoal } = useAppData();
  const [busy, setBusy] = useState(false);
  const [flashMsg, setFlashMsgState] = useState("");
  const [newGoalLabel, setNewGoalLabel] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [extraToAdd, setExtraToAdd] = useState<string>(EXTRA_BALANCE_DESTINATIONS[0]?.id ?? "");

  const order = resolveAllocationOrder(profile.allocation_order, goals);
  const usedIds = new Set(order.flat().map((t) => t.id));
  const availableExtras = EXTRA_BALANCE_DESTINATIONS.filter((d) => !usedIds.has(d.id));

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
      flash("Could not save that order");
    } finally {
      setBusy(false);
    }
  };

  const moveTier = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length || busy) return;
    const next = order.slice();
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  const tieWithNext = (i: number) => {
    if (busy || order[i]?.length !== 1 || order[i + 1]?.length !== 1) return;
    const next = order.slice();
    next.splice(i, 2, [
      { id: order[i][0].id, weightPct: 50 },
      { id: order[i + 1][0].id, weightPct: 50 },
    ]);
    commit(next);
  };

  const untie = (i: number) => {
    const tier = order[i];
    if (busy || tier.length !== 2) return;
    const next = order.slice();
    next.splice(i, 1, [{ id: tier[0].id, weightPct: 100 }], [{ id: tier[1].id, weightPct: 100 }]);
    commit(next);
  };

  const setWeight = (i: number, itemIdx: 0 | 1, pct: number) => {
    const tier = order[i];
    if (tier.length !== 2) return;
    const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
    const next = order.slice();
    next[i] = itemIdx === 0 ? [{ ...tier[0], weightPct: clamped }, { ...tier[1], weightPct: 100 - clamped }] : [{ ...tier[0], weightPct: 100 - clamped }, { ...tier[1], weightPct: clamped }];
    commit(next);
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

  // New destination lands right before "deposit" (the usual catch-all), same spot a newly-added
  // goal lands via resolveAllocationOrder — so it starts actually getting funded instead of
  // sitting unranked, and you just drag it (or tie it) wherever you actually want it.
  const addExtraDestination = (id: string) => {
    if (!id || busy) return;
    const depositIdx = order.findIndex((tier) => tier.some((t) => t.id === DEPOSIT_ALLOCATION_ID));
    const insertAt = depositIdx === -1 ? order.length : depositIdx;
    const next = [...order.slice(0, insertAt), [{ id, weightPct: 100 }], ...order.slice(insertAt)];
    commit(next);
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

  // Deposit has no cap, so a solo (untied) deposit row swallows the entire remaining surplus —
  // anything ranked below it would get nothing until it's moved or tied with something.
  const depositSoloIdx = order.findIndex((tier) => tier.length === 1 && tier[0].id === DEPOSIT_ALLOCATION_ID);
  const depositBlocksLater = depositSoloIdx !== -1 && depositSoloIdx !== order.length - 1;

  return (
    <Panel title="Pay priority" icon={ListOrdered}>
      <div style={{ fontSize: 12.5, color: MUTE, marginBottom: 12, lineHeight: 1.5 }}>
        Where each fortnight&apos;s surplus goes, after budgeted spending, bills, and credit card paydown (always first, fixed).
        Tie two adjacent rows to split the surplus between them instead of fully funding one before the next starts.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {order.map((tier, i) => (
          <div key={tier.map((t) => t.id).join("+")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", background: "#FBF9F2", border: `1px solid ${LINE}`, borderRadius: 8, flexWrap: "wrap" }}>
            {tier.length === 1 ? (
              <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>
                {i + 1}. {destinationLabel(tier[0].id, goals)}
              </span>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, color: NAVY }}>{i + 1}.</span>
                <span style={{ color: NAVY }}>{destinationLabel(tier[0].id, goals)}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={tier[0].weightPct}
                  onChange={(e) => setWeight(i, 0, Number(e.target.value))}
                  style={{ ...selStyle, width: 54, height: 28, fontSize: 12, textAlign: "right" }}
                />
                <span style={{ color: MUTE, fontSize: 12 }}>% / {100 - tier[0].weightPct}%</span>
                <span style={{ color: NAVY }}>{destinationLabel(tier[1].id, goals)}</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button onClick={() => moveTier(i, -1)} disabled={i === 0 || busy} title="Move up" style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "#E5E0D0" : "#A99B6E", display: "flex" }}>
                <ArrowUp size={14} />
              </button>
              <button onClick={() => moveTier(i, 1)} disabled={i === order.length - 1 || busy} title="Move down" style={{ background: "none", border: "none", cursor: i === order.length - 1 ? "default" : "pointer", color: i === order.length - 1 ? "#E5E0D0" : "#A99B6E", display: "flex" }}>
                <ArrowDown size={14} />
              </button>
              {tier.length === 1 && i < order.length - 1 && order[i + 1].length === 1 && (
                <button onClick={() => tieWithNext(i)} disabled={busy} title="Tie with the next row — split the surplus between them" style={{ background: "none", border: "none", cursor: "pointer", color: "#A99B6E", display: "flex" }}>
                  <Link2 size={14} />
                </button>
              )}
              {tier.length === 2 && (
                <button onClick={() => untie(i)} disabled={busy} title="Untie — back to two separate rows" style={{ background: "none", border: "none", cursor: "pointer", color: "#A99B6E", display: "flex" }}>
                  <Unlink size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {depositBlocksLater && (
        <div style={{ fontSize: 11.5, color: UNFAV, marginTop: 10, lineHeight: 1.5 }}>
          House deposit has no cap, so it&apos;s currently taking the entire surplus once it&apos;s reached — anything ranked below it gets nothing. Move it down or tie it with something to share instead.
        </div>
      )}

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
            style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: INK, border: "none", borderRadius: 8, padding: "9px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", height: 36, fontFamily: "var(--font-space-grotesk), sans-serif" }}
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
        A new goal lands just above the deposit — rank it and tie it with something above (e.g. 20% to Holiday, 80% to Deposit) like any other row. Edit an existing goal&apos;s
        target or logged progress on the <b style={{ color: NAVY }}>Goals</b> list below.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
        <button
          onClick={resetToDefault}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: MUTE, border: `1px solid ${LINE}`, borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" }}
        >
          <RotateCcw size={13} /> Reset to default order
        </button>
        {flashMsg && <span style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>{flashMsg}</span>}
      </div>
    </Panel>
  );
}
