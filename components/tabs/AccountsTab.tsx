"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { AUD, num } from "@/lib/money";
import { netPosition } from "@/lib/derive";
import { dateFromISO, dayLabel } from "@/lib/period";
import { CARD, LINE, MUTE, GOLD, INK, NAVY, GOLD_SOFT, UNFAV, inputStyle } from "@/lib/theme";
import { Progress, Stat } from "@/components/ui/atoms";
import type { Balances } from "@/lib/types";

const BALANCE_FIELDS: [keyof Omit<Balances, "user_id">, string][] = [
  ["everyday", "Everyday account"],
  ["anzplus", "ANZ Plus — deposit"],
  ["emergency", "Emergency fund"],
  ["holiday", "Holiday (cruise)"],
  ["shares", "Shares (CMC)"],
  ["superb", "Super (UniSuper)"],
  ["cc", "Credit card (owing)"],
  ["hecs", "HECS-HELP (owing)"],
];

export default function AccountsTab() {
  const { profile, balances, snapshots, D, updateBalances, takeSnapshot } = useAppData();
  // Seeded once from the server-fetched balances; kept as a local editable buffer thereafter
  // so typing doesn't fire a write on every keystroke (only on blur — see commit()).
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(BALANCE_FIELDS.map(([k]) => [k, String(balances[k])]))
  );
  const [flashMsg, setFlashMsg] = useState("");

  const flash = (m = "Saved") => {
    setFlashMsg(m);
    setTimeout(() => setFlashMsg(""), 1300);
  };

  const commit = (key: keyof Omit<Balances, "user_id">, value: string) => {
    updateBalances({ [key]: num(value) } as Partial<Omit<Balances, "user_id">>);
    flash();
  };

  const onSnapshot = async () => {
    await takeSnapshot();
    flash("Snapshot saved");
  };

  const { assets, liabilities, net } = netPosition(balances);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 20, flex: "1 1 340px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Current balances</div>
            <button
              onClick={onSnapshot}
              style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: INK, border: "none", borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-space-grotesk), sans-serif" }}
            >
              <Camera size={14} /> Snapshot
            </button>
          </div>
          {BALANCE_FIELDS.map(([k, lbl]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 13, color: k === "cc" || k === "hecs" ? UNFAV : NAVY }}>{lbl}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4, width: 140 }}>
                <span style={{ color: MUTE, fontSize: 13 }}>$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={inputs[k] ?? ""}
                  onChange={(e) => setInputs((ii) => ({ ...ii, [k]: e.target.value }))}
                  onBlur={(e) => commit(k, e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          ))}
          {flashMsg && <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginTop: 8 }}>{flashMsg}</div>}
        </div>
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: `linear-gradient(120deg, ${INK}, ${NAVY})`, color: "#fff", borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: GOLD_SOFT }}>Net position</div>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 32, fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums", color: net >= 0 ? "#fff" : "#F0A08C" }}>
              {net < 0 ? "−" : ""}
              {AUD(Math.abs(net))}
            </div>
            <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 12.5 }}>
              <Stat k="Assets" v={AUD(assets)} color="#7BE0AE" />
              <Stat k="Debts" v={AUD(liabilities)} color="#F0A08C" />
            </div>
            <div style={{ fontSize: 11.5, color: "#B9C2D6", marginTop: 12, lineHeight: 1.5 }}>
              Negative today is normal for a new grad — HECS is the cheapest debt you&apos;ll hold. It flips positive as the deposit grows.
            </div>
          </div>
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <Progress label="Emergency fund" value={num(balances.emergency)} target={num(profile.emergency_target)} colorFrom="#2E7D5B" />
            <Progress label="House deposit (5%)" value={num(balances.anzplus)} target={D.dep5} />
          </div>
        </div>
      </div>
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Snapshot history</div>
        {snapshots.length === 0 ? (
          <div style={{ fontSize: 13, color: MUTE }}>
            No snapshots yet. Enter balances above and hit <b style={{ color: NAVY }}>Snapshot</b> — each drops a dot on the Overview chart.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {snapshots.map((s) => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", fontSize: 13, padding: "7px 4px", borderBottom: `1px solid ${LINE}`, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: MUTE }}>Fortnight of {dayLabel(dateFromISO(s.period_key))}</span>
                <span>Deposit {AUD(s.deposit)}</span>
                <span>Emergency {AUD(s.emergency)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
