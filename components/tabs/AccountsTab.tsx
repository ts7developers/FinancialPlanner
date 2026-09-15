"use client";

import { useState } from "react";
import { Camera, ArrowRightLeft, RefreshCw, Trash2, Plus, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { useAppData } from "@/components/AppDataProvider";
import { AUD, num } from "@/lib/money";
import { netPosition, applyTransfer, computeHoldingPL, LIABILITY_ACCOUNTS } from "@/lib/derive";
import { dateFromISO, dayLabel } from "@/lib/period";
import { MUTE_ICON, ON_ACCENT_DARK, ON_ACCENT_GOLD, SURFACE_DARK, SURFACE_DARK_2, SURFACE_SUBTLE, CARD, LINE, MUTE, GOLD, INK, NAVY, FAV, UNFAV, inputStyle, selStyle, BALANCE_FIELDS } from "@/lib/theme";
import { Stat, Field } from "@/components/ui/atoms";
import type { Balances } from "@/lib/types";

export default function AccountsTab() {
  const {
    balances,
    snapshots,
    transfers,
    holdings,
    holdingLots,
    goals,
    accounts,
    addAccount,
    deleteAccount,
    updateAccountBalance,
    updateBalances,
    takeSnapshot,
    addTransfer,
    addOrUpdateHolding,
    deleteHolding,
    refreshHoldingPrices,
    addHoldingLot,
    deleteHoldingLot,
  } = useAppData();
  // Seeded once from the server-fetched balances; kept as a local editable buffer thereafter
  // so typing doesn't fire a write on every keystroke (only on blur — see commit()).
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(BALANCE_FIELDS.map(([k]) => [k, String(balances[k])]))
  );
  // Same buffering pattern as `inputs`, keyed by custom account id.
  const [customBalanceInputs, setCustomBalanceInputs] = useState<Record<string, string>>({});
  const [flashMsg, setFlashMsg] = useState("");
  const [newAccountLabel, setNewAccountLabel] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState("");

  const onAddAccount = async () => {
    if (!newAccountLabel.trim()) return;
    setAccountBusy(true);
    setAccountError("");
    try {
      await addAccount(newAccountLabel, Number(newAccountBalance) || 0);
      setNewAccountLabel("");
      setNewAccountBalance("");
      flash("Account added");
    } catch {
      setAccountError("Could not add that account — run migration 0025_accounts.sql, then try again.");
    } finally {
      setAccountBusy(false);
    }
  };

  const onDeleteAccount = async (id: string) => {
    try {
      await deleteAccount(id);
    } catch {
      setAccountError("Could not remove that account — try again.");
    }
  };

  const onCommitAccountBalance = async (id: string, value: string) => {
    try {
      await updateAccountBalance(id, num(value));
      flash();
    } catch {
      flash("Could not save that balance");
    }
  };

  const flash = (m = "Saved") => {
    setFlashMsg(m);
    setTimeout(() => setFlashMsg(""), 1300);
  };

  const commit = async (key: keyof Omit<Balances, "user_id">, value: string) => {
    try {
      await updateBalances({ [key]: num(value) } as Partial<Omit<Balances, "user_id">>);
      flash();
    } catch {
      flash("Could not save that balance");
    }
  };

  const onSnapshot = async () => {
    try {
      await takeSnapshot();
      flash("Snapshot saved");
    } catch {
      flash("Could not save that snapshot");
    }
  };

  const [transferFrom, setTransferFrom] = useState<string>("everyday");
  const [transferTo, setTransferTo] = useState<string>("cc");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState("");

  // Every possible transfer endpoint: the fixed tracked balances, plus every custom account.
  const transferOptions = [
    ...BALANCE_FIELDS.map(([k, lbl]) => ({ value: k as string, label: lbl })),
    ...accounts.map((a) => ({ value: a.id, label: a.label })),
  ];

  const onTransfer = async () => {
    const amount = Number(transferAmount);
    if (transferFrom === transferTo) {
      setTransferError("Pick two different accounts.");
      return;
    }
    if (!(amount > 0)) {
      setTransferError("Enter an amount.");
      return;
    }
    setTransferBusy(true);
    setTransferError("");
    try {
      await addTransfer(transferFrom, transferTo, amount, transferNote || undefined);
      // Only the built-in balance fields have a separate local editable buffer (`inputs`) to
      // resync — a custom account's displayed balance reads straight from context state, which
      // addTransfer already updated.
      const fromKey = BALANCE_FIELDS.find(([k]) => k === transferFrom)?.[0];
      const toKey = BALANCE_FIELDS.find(([k]) => k === transferTo)?.[0];
      if (fromKey && toKey) {
        const patch = applyTransfer(balances, fromKey, toKey, amount);
        setInputs((ii) => ({ ...ii, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) }));
      } else if (fromKey) {
        setInputs((ii) => ({ ...ii, [fromKey]: String(num(ii[fromKey]) - amount) }));
      } else if (toKey) {
        const toDelta = LIABILITY_ACCOUNTS.has(toKey) ? -amount : amount;
        setInputs((ii) => ({ ...ii, [toKey]: String(num(ii[toKey]) + toDelta) }));
      }
      setTransferAmount("");
      setTransferNote("");
      flash("Transferred");
    } catch {
      setTransferError("Could not complete the transfer");
    } finally {
      setTransferBusy(false);
    }
  };

  const [buyCode, setBuyCode] = useState("");
  const [buyShares, setBuyShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [buyDate, setBuyDate] = useState("");
  const [buyAccount, setBuyAccount] = useState<keyof Omit<Balances, "user_id">>("everyday");
  const [holdingBusy, setHoldingBusy] = useState(false);
  const [holdingError, setHoldingError] = useState("");

  const onLogBuy = async () => {
    if (!buyCode.trim() || !(Number(buyShares) > 0) || !(Number(buyPrice) > 0)) {
      setHoldingError("Enter a code, share count and price paid.");
      return;
    }
    setHoldingBusy(true);
    setHoldingError("");
    try {
      await addHoldingLot(buyCode, Number(buyShares), Number(buyPrice), buyDate || new Date().toISOString().slice(0, 10), buyAccount);
      setBuyCode("");
      setBuyShares("");
      setBuyPrice("");
      setBuyDate("");
      flash("Buy logged");
    } catch {
      setHoldingError("Could not save that buy");
    } finally {
      setHoldingBusy(false);
    }
  };

  const onCorrectShares = async (code: string, value: string) => {
    try {
      await addOrUpdateHolding(code, Number(value) || 0);
      flash("Shares updated");
    } catch {
      setHoldingError("Could not update shares");
    }
  };

  const onRefreshPrices = async () => {
    setHoldingBusy(true);
    setHoldingError("");
    try {
      await refreshHoldingPrices();
      flash("Prices updated");
    } catch {
      setHoldingError("Could not fetch prices right now");
    } finally {
      setHoldingBusy(false);
    }
  };

  const onDeleteHolding = async (id: string) => {
    try {
      await deleteHolding(id);
      flash("Holding removed");
    } catch {
      setHoldingError("Could not remove that holding");
    }
  };

  const onDeleteHoldingLot = async (id: string) => {
    try {
      await deleteHoldingLot(id);
      flash("Buy removed");
    } catch {
      setHoldingError("Could not remove that buy");
    }
  };

  const holdingsValue = holdings.reduce((s, h) => s + (h.last_price != null ? h.last_price * h.shares : 0), 0);
  const lastPricedAt = holdings.reduce<string | null>((latest, h) => (!latest || (h.priced_at && h.priced_at > latest) ? h.priced_at : latest), null);
  const holdingPLs = holdings.map((h) => ({ h, pl: computeHoldingPL(holdingLots, h.code, h.shares, h.last_price) }));
  const totalPL = holdingPLs.reduce((s, { pl }) => s + (pl.unrealizedPL ?? 0), 0);
  const anyPL = holdingPLs.some(({ pl }) => pl.unrealizedPL != null);

  const goalsBalanceTotal = goals.reduce((s, g) => s + (Number(g.current_amount) || 0), 0);
  const customAccountsTotal = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const { assets, liabilities, net } = netPosition(balances, goalsBalanceTotal + customAccountsTotal);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 20, flex: "1 1 340px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 16 }}>Current balances</div>
            <button
              onClick={onSnapshot}
              style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: ON_ACCENT_DARK, border: "none", borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-space-grotesk), sans-serif" }}
            >
              <Camera size={14} /> Snapshot
            </button>
          </div>
          {BALANCE_FIELDS.map(([k, lbl]) => {
            const autoFromHoldings = k === "shares" && holdings.length > 0;
            return (
              <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
                <span style={{ fontSize: 13, color: k === "cc" || k === "hecs" ? UNFAV : NAVY }}>
                  {lbl}
                  {autoFromHoldings && <span style={{ fontSize: 10.5, color: MUTE, marginLeft: 6 }}>(from Investments)</span>}
                </span>
                {autoFromHoldings ? (
                  <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", fontWeight: 600, color: NAVY, width: 140, textAlign: "right" }}>
                    {AUD(num(balances[k]), 2)}
                  </span>
                ) : (
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
                )}
              </div>
            );
          })}
          {accounts.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 13, color: NAVY }}>{a.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4, width: 140 }}>
                <span style={{ color: MUTE, fontSize: 13 }}>$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={customBalanceInputs[a.id] ?? String(a.balance)}
                  onChange={(e) => setCustomBalanceInputs((ci) => ({ ...ci, [a.id]: e.target.value }))}
                  onBlur={(e) => onCommitAccountBalance(a.id, e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          ))}
          {flashMsg && <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginTop: 8 }}>{flashMsg}</div>}
        </div>
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: `linear-gradient(120deg, ${SURFACE_DARK}, ${SURFACE_DARK_2})`, color: "#fff", borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: ON_ACCENT_GOLD }}>Net position</div>
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
          <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, fontSize: 12, color: MUTE, lineHeight: 1.5 }}>
            Goal progress and the FHSS-adjusted house deposit total are tracked on <b style={{ color: NAVY }}>Overview</b> and{" "}
            <b style={{ color: NAVY }}>Savings</b> — edit balances here and they&apos;ll flow through automatically.
          </div>
        </div>
      </div>
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
          <Wallet size={16} color={GOLD} /> Add a custom account
        </div>
        <div style={{ fontSize: 12, color: MUTE, marginBottom: 12 }}>
          Beyond the built-in accounts above, add a named one here — e.g. a dedicated sub-account for a specific goal. It gets a real,
          tracked balance (edit it above, or move money to/from it below) and shows up as an option when picking a goal&apos;s account on{" "}
          <b style={{ color: NAVY }}>Savings</b>.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="e.g. ANZ Plus — Rego savings"
            value={newAccountLabel}
            onChange={(e) => setNewAccountLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddAccount()}
            style={{ ...selStyle, width: 220, textAlign: "left" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ color: MUTE, fontSize: 13 }}>$</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="Starting balance"
              value={newAccountBalance}
              onChange={(e) => setNewAccountBalance(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddAccount()}
              style={{ ...selStyle, width: 130, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
            />
          </div>
          <button
            onClick={onAddAccount}
            disabled={accountBusy || !newAccountLabel.trim()}
            style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: ON_ACCENT_DARK, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: accountBusy ? "default" : "pointer", opacity: accountBusy || !newAccountLabel.trim() ? 0.6 : 1, fontFamily: "var(--font-space-grotesk), sans-serif", height: 36 }}
          >
            <Plus size={14} /> Add account
          </button>
        </div>
        {accountError && <div style={{ fontSize: 12, color: UNFAV, marginTop: 8 }}>{accountError}</div>}
        {accounts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
            {accounts.map((a) => (
              <span
                key={a.id}
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: NAVY, background: SURFACE_SUBTLE, border: `1px solid ${LINE}`, borderRadius: 20, padding: "5px 7px 5px 12px" }}
              >
                {a.label}
                <button onClick={() => onDeleteAccount(a.id)} title="Remove this account" style={{ background: "none", border: "none", cursor: "pointer", color: MUTE_ICON, display: "flex" }}>
                  <Trash2 size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Move money</div>
        <div style={{ fontSize: 12, color: MUTE, marginBottom: 12 }}>
          Payday: sweep from Everyday to pay off the credit card, top up the emergency fund, or add to the house deposit.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="From">
            <select value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)} style={{ ...selStyle, width: 170 }}>
              {transferOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To">
            <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} style={{ ...selStyle, width: 170 }}>
              {transferOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount">
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ color: MUTE, fontSize: 13 }}>$</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                style={{ ...selStyle, width: 110, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              />
            </div>
          </Field>
          <Field label="Note (optional)" grow>
            <input
              type="text"
              placeholder="e.g. Payday sweep"
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              style={{ ...selStyle, width: "100%", textAlign: "left" }}
            />
          </Field>
          <button
            onClick={onTransfer}
            disabled={transferBusy}
            style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: ON_ACCENT_DARK, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: transferBusy ? "default" : "pointer", opacity: transferBusy ? 0.7 : 1, fontFamily: "var(--font-space-grotesk), sans-serif", height: 36 }}
          >
            <ArrowRightLeft size={14} /> Transfer
          </button>
        </div>
        {transferError && <div style={{ fontSize: 12, color: UNFAV, marginTop: 8 }}>{transferError}</div>}
        {transfers.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}`, display: "flex", flexDirection: "column", gap: 2 }}>
            {transfers.slice(0, 5).map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: MUTE }}>
                  {transferOptions.find((o) => o.value === t.from_account)?.label ?? t.from_account} →{" "}
                  {transferOptions.find((o) => o.value === t.to_account)?.label ?? t.to_account}
                  {t.note ? ` · ${t.note}` : ""}
                </span>
                <span>{AUD(t.amount, 2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <div>
            <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 600, fontSize: 15 }}>Investments</div>
            <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2 }}>
              ASX holdings — delayed quotes, refresh manually. Revalues the Shares balance above.
            </div>
          </div>
          <button
            onClick={onRefreshPrices}
            disabled={holdingBusy || holdings.length === 0}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              color: INK,
              border: `1px solid ${LINE}`,
              borderRadius: 8,
              padding: "8px 13px",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: holdingBusy || holdings.length === 0 ? "default" : "pointer",
              opacity: holdingBusy || holdings.length === 0 ? 0.5 : 1,
              fontFamily: "var(--font-space-grotesk), sans-serif",
            }}
          >
            <RefreshCw size={14} /> Refresh prices
          </button>
        </div>
        {holdings.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {holdingPLs.map(({ h, pl }) => (
              <div key={h.id} style={{ padding: "7px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 600, width: 56, flexShrink: 0 }}>{h.code}</span>
                  <input
                    key={`${h.id}-${h.shares}`}
                    type="number"
                    inputMode="decimal"
                    defaultValue={h.shares}
                    onBlur={(e) => onCorrectShares(h.code, e.target.value)}
                    style={{ ...inputStyle, width: 70, padding: "3px 6px", textAlign: "right" }}
                  />
                  <span style={{ width: 76, fontVariantNumeric: "tabular-nums" }}>{h.last_price != null ? AUD(h.last_price, 2) : "—"}</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 2,
                      width: 70,
                      fontVariantNumeric: "tabular-nums",
                      color: h.last_change_pct == null ? MUTE : h.last_change_pct >= 0 ? FAV : UNFAV,
                    }}
                  >
                    {h.last_change_pct != null && (h.last_change_pct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
                    {h.last_change_pct != null ? `${h.last_change_pct.toFixed(1)}%` : "—"}
                  </span>
                  <span style={{ flex: 1, textAlign: "right", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                    {h.last_price != null ? AUD(h.last_price * h.shares, 2) : "—"}
                  </span>
                  <button onClick={() => onDeleteHolding(h.id)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTE_ICON, display: "flex" }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                {pl.avgCost != null && (
                  <div style={{ fontSize: 11, color: MUTE, marginTop: 3, paddingLeft: 66 }}>
                    avg cost {AUD(pl.avgCost, 4)} · cost basis {AUD(pl.costBasis, 2)}
                    {pl.unrealizedPL != null && (
                      <>
                        {" · "}
                        <span style={{ color: pl.unrealizedPL >= 0 ? FAV : UNFAV, fontWeight: 600 }}>
                          {pl.unrealizedPL >= 0 ? "+" : "−"}
                          {AUD(Math.abs(pl.unrealizedPL), 2)} ({pl.unrealizedPLPct! >= 0 ? "+" : ""}
                          {pl.unrealizedPLPct!.toFixed(1)}%)
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", fontWeight: 700, fontFamily: "var(--font-space-grotesk), sans-serif" }}>
              <span>Total{lastPricedAt ? ` · priced ${new Date(lastPricedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
              <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                {anyPL && (
                  <span style={{ fontSize: 12, color: totalPL >= 0 ? FAV : UNFAV, fontVariantNumeric: "tabular-nums" }}>
                    P/L {totalPL >= 0 ? "+" : "−"}
                    {AUD(Math.abs(totalPL), 2)}
                  </span>
                )}
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(holdingsValue, 2)}</span>
              </span>
            </div>
          </div>
        )}
        <div style={{ marginTop: 14, paddingTop: holdings.length > 0 ? 12 : 0, borderTop: holdings.length > 0 ? `1px solid ${LINE}` : "none" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, marginBottom: 8 }}>Log a buy</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label="Code (ASX)">
              <input
                type="text"
                placeholder="e.g. AGL"
                value={buyCode}
                onChange={(e) => setBuyCode(e.target.value.toUpperCase())}
                style={{ ...selStyle, width: 80, textTransform: "uppercase" }}
              />
            </Field>
            <Field label="Shares">
              <input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={buyShares}
                onChange={(e) => setBuyShares(e.target.value)}
                style={{ ...selStyle, width: 80, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              />
            </Field>
            <Field label="Price paid">
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ color: MUTE, fontSize: 13 }}>$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  style={{ ...selStyle, width: 80, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                />
              </div>
            </Field>
            <Field label="Date">
              <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)} style={{ ...selStyle, width: 140 }} />
            </Field>
            <Field label="Paid from">
              <select value={buyAccount} onChange={(e) => setBuyAccount(e.target.value as keyof Omit<Balances, "user_id">)} style={{ ...selStyle, width: 160 }}>
                {BALANCE_FIELDS.filter(([k]) => k !== "shares").map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </Field>
            <button
              onClick={onLogBuy}
              disabled={holdingBusy}
              style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: ON_ACCENT_DARK, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: holdingBusy ? "default" : "pointer", opacity: holdingBusy ? 0.7 : 1, fontFamily: "var(--font-space-grotesk), sans-serif", height: 36 }}
            >
              <Plus size={14} /> Log buy
            </button>
          </div>
          <div style={{ fontSize: 11, color: MUTE, marginTop: 6 }}>
            Adds to that code&apos;s share count and its average cost, and debits the account it was paid from. Correct the Shares number above directly for sells or fixes — sells aren&apos;t tracked as lots and don&apos;t touch any balance.
          </div>
        </div>
        {holdingError && <div style={{ fontSize: 12, color: UNFAV, marginTop: 8 }}>{holdingError}</div>}
        {holdingLots.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}`, display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MUTE, marginBottom: 4 }}>Recent buys</div>
            {holdingLots.slice(0, 5).map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "4px 0", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: MUTE }}>
                  {l.date} · {l.code} · {l.shares} sh @ {AUD(l.price, 4)}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{AUD(l.shares * l.price, 2)}</span>
                  <button onClick={() => onDeleteHoldingLot(l.id)} style={{ background: "none", border: "none", cursor: "pointer", color: MUTE_ICON, display: "flex" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr 1fr", fontSize: 13, padding: "7px 4px", borderBottom: `1px solid ${LINE}`, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: MUTE }}>Fortnight of {dayLabel(dateFromISO(s.period_key))}</span>
                <span>Deposit {AUD(s.deposit)}</span>
                <span>Emergency {AUD(s.emergency)}</span>
                <span style={{ color: UNFAV }}>CC {AUD(Number(s.cc) || 0)}</span>
                <span style={{ color: MUTE }}>HECS {AUD(Number(s.hecs) || 0)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
