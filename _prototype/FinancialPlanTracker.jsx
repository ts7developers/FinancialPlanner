import React, { useState, useEffect, useMemo } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell,
} from "recharts";
import {
  Wallet, PiggyBank, Home, ScrollText, LayoutDashboard, Landmark,
  TrendingUp, Check, RotateCcw, Camera, SlidersHorizontal, Copy, Receipt, Plus, Trash2, CalendarClock,
} from "lucide-react";

/* ---------- palette ---------- */
const INK = "#16203A", NAVY = "#1F2A44", NAVY2 = "#2C3A5C";
const GOLD = "#C6A052", GOLD_SOFT = "#E7D6A8";
const PAPER = "#F7F5EF", CARD = "#FFFFFF", LINE = "#E4E0D4";
const FAV = "#2E7D5B", UNFAV = "#C0492F", MUTE = "#6B7280";
const PIE_COLORS = ["#1F2A44", "#C6A052", "#2E7D5B", "#5B6B8C", "#B08636", "#8CA0BE", "#3F5170", "#D9C48A", "#4B7E68", "#A6B4CC", "#6E5A2A"];

/* ---------- default plan ---------- */
const DEFAULT_PLAN = {
  package: 68000, sg: 0.12, ptFrac: 0.8, hecsThreshold: 69528,
  payAnchor: "2026-08-24", ftStart: "2026-10-19",
  openDeposit: 3000, emergency: 5000,
  house: 680000, depPct: 0.05, fhog: 10000, costs: 3000, cc: 190.6,
  cats: {
    board: { a26: 0, a27: 433.33 }, groceries: { a26: 476.67, a27: 476.67 },
    fuel: { a26: 238.33, a27: 238.33 }, carins: { a26: 58.34, a27: 58.34 },
    rego: { a26: 68.72, a27: 68.72 }, gym: { a26: 82.12, a27: 82.12 },
    bball: { a26: 58.54, a27: 58.54 }, health: { a26: 0, a27: 130 },
    claude: { a26: 34, a27: 34 }, iracing: { a26: 17.13, a27: 17.13 },
    fun: { a26: 216.67, a27: 216.67 },
  },
};
const CAT_META = [
  { id: "board", label: "Board" }, { id: "groceries", label: "Groceries" },
  { id: "fuel", label: "Fuel" }, { id: "carins", label: "Car insurance" },
  { id: "rego", label: "Car rego" }, { id: "gym", label: "Gym" },
  { id: "bball", label: "Basketball" }, { id: "health", label: "Private health" },
  { id: "claude", label: "Claude Pro" }, { id: "iracing", label: "iRacing" },
  { id: "fun", label: "Fun money" },
];
const TXN_CATS = [...CAT_META, { id: "other", label: "Other" }];
const ACCOUNTS = ["Everyday", "ANZ Plus", "Fun money", "Credit card", "Holiday", "Cash"];
const ACC_COLOR = { Everyday: "#5B6B8C", "ANZ Plus": "#1F2A44", "Fun money": "#C6A052", "Credit card": "#C0492F", Holiday: "#2E7D5B", Cash: "#8CA0BE" };
const TODAY = new Date().toISOString().slice(0, 10);
const FN_PER_YEAR = 26, MO_PER_YEAR = 12, FN_FROM_MO = MO_PER_YEAR / FN_PER_YEAR; // monthly → fortnightly

/* ---------- tax engine ---------- */
const incomeTaxAU = (T) =>
  0.16 * Math.max(0, Math.min(T, 45000) - 18200) + 0.30 * Math.max(0, Math.min(T, 135000) - 45000) +
  0.37 * Math.max(0, Math.min(T, 190000) - 135000) + 0.45 * Math.max(0, T - 190000);
const litoAU = (T) => Math.max(0, T <= 37500 ? 700 : T <= 45000 ? 700 - (T - 37500) * 0.05 : T < 66667 ? 325 - (T - 45000) * 0.015 : 0);
const netFromPackage = (pkg, sg, ht) => {
  const cash = pkg / (1 + sg);
  const tax = Math.max(0, incomeTaxAU(cash) - litoAU(cash)) + 0.02 * cash + 0.15 * Math.max(0, cash - ht);
  return { cash, net: cash - tax };
};

/* ---------- helpers ---------- */
const AUD = (n, dp = 0) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const iso = (dt) => dt.toISOString().slice(0, 10);
const dObj = (s) => new Date(s + "T00:00:00");
const dShort = (dt) => dt.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const DAY = 86400000;
function buildPeriods(anchorStr) {
  const out = []; const a = dObj(anchorStr); const end = dObj("2029-12-31");
  let i = 0, start = new Date(a);
  while (start <= end && i < 130) {
    const e = new Date(start); e.setDate(e.getDate() + 13);
    out.push({ idx: i, key: iso(start), start: new Date(start), end: e, label: `${dShort(start)} – ${dShort(e)}`, year: start.getFullYear() });
    start = new Date(start); start.setDate(start.getDate() + 14); i++;
  }
  return out;
}
const periodKeyOf = (dateStr, anchorStr) => {
  if (!dateStr) return null;
  const a = dObj(anchorStr), d = dObj(dateStr);
  const idx = Math.floor((d - a) / (14 * DAY));
  if (idx < 0) return null;
  const s = new Date(a); s.setDate(s.getDate() + idx * 14); return iso(s);
};

function useIsMobile(bp = 680) {
  const [m, setM] = useState(typeof window !== "undefined" && window.innerWidth < bp);
  useEffect(() => { const on = () => setM(window.innerWidth < bp); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, [bp]);
  return m;
}

export default function FinancialPlanTracker() {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("overview");
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [recs, setRecs] = useState({});
  const [balances, setBalances] = useState({ everyday: "", anzplus: "3000", emergency: "", holiday: "3100", shares: "3546.50", superb: "19790.73", cc: "190.60", hecs: "45182.77" });
  const [snapshots, setSnapshots] = useState([]);
  const [txns, setTxns] = useState([]);
  const [form, setForm] = useState({ date: TODAY, desc: "", amount: "", catId: "groceries", account: "Everyday" });
  const [txnFilter, setTxnFilter] = useState("all");
  const [period, setPeriod] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [flashMsg, setFlashMsg] = useState("");

  const PERIODS = useMemo(() => buildPeriods(plan.payAnchor || DEFAULT_PLAN.payAnchor), [plan.payAnchor]);
  useEffect(() => { if (!period || !PERIODS.find((p) => p.key === period)) setPeriod(PERIODS[0]?.key); }, [PERIODS]); // eslint-disable-line

  /* load / persist */
  useEffect(() => {
    (async () => {
      try { const p = await window.storage.get("plan:assumptions"); if (p?.value) { const j = JSON.parse(p.value); setPlan({ ...DEFAULT_PLAN, ...j, cats: { ...DEFAULT_PLAN.cats, ...(j.cats || {}) } }); } } catch {}
      try { const r = await window.storage.get("plan:recs2"); if (r?.value) setRecs(JSON.parse(r.value)); } catch {}
      try { const b = await window.storage.get("plan:balances"); if (b?.value) setBalances(JSON.parse(b.value)); } catch {}
      try { const s = await window.storage.get("plan:snapshots2"); if (s?.value) setSnapshots(JSON.parse(s.value)); } catch {}
      try { const t = await window.storage.get("plan:txns"); if (t?.value) setTxns(JSON.parse(t.value)); } catch {}
      setLoaded(true);
    })();
  }, []);
  const persist = async (k, v) => { try { await window.storage.set(k, JSON.stringify(v)); } catch {} };
  useEffect(() => { if (loaded) persist("plan:assumptions", plan); }, [plan, loaded]);
  useEffect(() => { if (loaded) persist("plan:recs2", recs); }, [recs, loaded]);
  useEffect(() => { if (loaded) persist("plan:balances", balances); }, [balances, loaded]);
  useEffect(() => { if (loaded) persist("plan:snapshots2", snapshots); }, [snapshots, loaded]);
  useEffect(() => { if (loaded) persist("plan:txns", txns); }, [txns, loaded]);
  const flash = (m = "Saved") => { setFlashMsg(m); setTimeout(() => setFlashMsg(""), 1300); };

  /* ---------- derived ---------- */
  const D = useMemo(() => {
    const p = Number(plan.package) || 0, sg = Number(plan.sg) || 0, pf = Number(plan.ptFrac) || 0, ht = Number(plan.hecsThreshold) || 0;
    const ft = netFromPackage(p, sg, ht), pt = netFromPackage(p * pf, sg, ht);
    const catMo = (id, y) => Number(plan.cats[id]?.[y >= 2027 ? "a27" : "a26"]) || 0;
    const catFN = (id, y) => catMo(id, y) * FN_FROM_MO;
    const expMo = (y) => CAT_META.reduce((s, c) => s + catMo(c.id, y), 0);
    const expFN = (y) => expMo(y) * FN_FROM_MO;
    const dep5 = (Number(plan.house) || 0) * (Number(plan.depPct) || 0);
    const netCash = dep5 + (Number(plan.costs) || 0) - (Number(plan.fhog) || 0);
    return {
      netFTfn: ft.net / FN_PER_YEAR, netPTfn: pt.net / FN_PER_YEAR, netFTmo: ft.net / 12, cashFT: ft.cash,
      superFTfn: (p - ft.cash) / FN_PER_YEAR, catFN, expMo, expFN, dep5, netCash,
    };
  }, [plan]);

  const isFT = (per) => dObj(per.key) >= dObj(plan.ftStart || DEFAULT_PLAN.ftStart);
  const plannedIncomeFN = (per) => (isFT(per) ? D.netFTfn : D.netPTfn);

  const PLAN_PATH = useMemo(() => {
    let emerg = 0, dep = Number(plan.openDeposit) || 0;
    return PERIODS.map((per, i) => {
      const avail0 = plannedIncomeFN(per) - D.expFN(per.year) - (i === 0 ? Number(plan.cc) || 0 : 0);
      const avail = Math.max(0, avail0);
      const toE = Math.max(0, Math.min(avail, (Number(plan.emergency) || 0) - emerg));
      emerg += toE; dep += avail - toE;
      return { key: per.key, label: dShort(per.start), planDeposit: Math.round(dep) };
    });
  }, [plan, D, PERIODS]);

  /* ---------- transactions ---------- */
  const anchor = plan.payAnchor || DEFAULT_PLAN.payAnchor;
  const loggedByCat = useMemo(() => {
    const m = {};
    txns.forEach((t) => { const k = periodKeyOf(t.date, anchor); if (!k) return; if (!m[k]) m[k] = {}; m[k][t.catId] = (m[k][t.catId] || 0) + (Number(t.amount) || 0); });
    return m;
  }, [txns, anchor]);
  const addTxn = () => {
    if (!form.amount || !form.date) { flash("Add a date and amount"); return; }
    setTxns((p) => [{ id: Date.now(), ...form, amount: Number(form.amount) }, ...p]);
    setForm((f) => ({ ...f, desc: "", amount: "" })); flash("Expense logged");
  };
  const delTxn = (id) => setTxns((p) => p.filter((t) => t.id !== id));

  /* ---------- reconcile ---------- */
  const perObj = PERIODS.find((x) => x.key === period) || PERIODS[0];
  const rec = recs[period] || { income: "", actuals: {} };
  const setRec = (patch) => setRecs((pp) => ({ ...pp, [period]: { ...rec, ...patch } }));
  const setActual = (cid, v) => setRec({ actuals: { ...rec.actuals, [cid]: v } });
  const planInc = perObj ? plannedIncomeFN(perObj) : 0;
  const actInc = rec.income === "" ? null : Number(rec.income);
  const yr = perObj ? perObj.year : 2026;
  const catRows = CAT_META.map((c) => {
    const p = D.catFN(c.id, yr);
    const logged = loggedByCat[period]?.[c.id] || 0;
    const manual = rec.actuals[c.id];
    const hasManual = manual !== undefined && manual !== "";
    const a = hasManual ? Number(manual) : logged > 0 ? logged : null;
    return { ...c, plan: p, logged, hasManual, actual: a, variance: a === null ? null : p - a };
  });
  const totPlanExp = catRows.reduce((s, r) => s + r.plan, 0);
  const totActExp = catRows.reduce((s, r) => s + (r.actual ?? 0), 0);
  const anyActual = catRows.some((r) => r.actual !== null) || actInc !== null;
  const expVar = totPlanExp - totActExp;
  const planSurplus = planInc - totPlanExp;
  const actSurplus = (actInc ?? planInc) - totActExp;
  const surplusVar = actSurplus - planSurplus;

  /* ---------- accounts ---------- */
  const num = (v) => (v === "" || v === undefined ? 0 : Number(v) || 0);
  const assets = num(balances.everyday) + num(balances.anzplus) + num(balances.emergency) + num(balances.holiday) + num(balances.shares) + num(balances.superb);
  const liabilities = num(balances.cc) + num(balances.hecs);
  const net = assets - liabilities;
  const takeSnapshot = () => {
    const t = new Date(); const key = periodKeyOf(iso(t), anchor) || iso(t);
    const snap = { key, when: t.toLocaleDateString("en-AU"), deposit: num(balances.anzplus), emergency: num(balances.emergency) };
    setSnapshots((pp) => [...pp.filter((s) => s.key !== key), snap].sort((a, b) => (a.key || "").localeCompare(b.key || ""))); flash("Snapshot saved");
  };
  const chartData = useMemo(() => PLAN_PATH.map((p) => { const s = snapshots.find((x) => x.key === p.key); return { ...p, actualDeposit: s ? s.deposit : null }; }), [PLAN_PATH, snapshots]);
  const pieData = CAT_META.map((c) => ({ name: c.label, value: D.catFN(c.id, yr) })).filter((d) => d.value > 0);
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const setP = (k, v) => setPlan((pp) => ({ ...pp, [k]: v }));
  const setCat = (id, yy, v) => setPlan((pp) => ({ ...pp, cats: { ...pp.cats, [id]: { ...pp.cats[id], [yy]: v } } }));
  const restoreDefaults = () => { if (window.confirm("Reset the plan assumptions to the original WCH baseline? Your reconciliations and balances stay.")) { setPlan(DEFAULT_PLAN); flash("Baseline restored"); } };
  const copyForClaude = () => {
    const lines = ["Updated plan assumptions:", `Salary package (incl super): $${plan.package}`, `Super rate: ${(plan.sg * 100).toFixed(1)}%`, `Part-time fraction: ${(plan.ptFrac * 100).toFixed(0)}%`,
      `First pay period starts: ${plan.payAnchor}`, `Full-time from: ${plan.ftStart}`,
      `House target: $${plan.house}`, `Deposit %: ${(plan.depPct * 100).toFixed(1)}%`, `FHOG: $${plan.fhog}`, `Buying costs: $${plan.costs}`, `Emergency target: $${plan.emergency}`, `Opening deposit: $${plan.openDeposit}`,
      "Monthly expenses (2026 / 2027):", ...CAT_META.map((c) => `  ${c.label}: $${plan.cats[c.id].a26} / $${plan.cats[c.id].a27}`)].join("\n");
    try { navigator.clipboard.writeText(lines); flash("Copied — paste to Claude to resync Excel"); } catch { flash("Copy failed"); }
  };
  const resetData = () => { if (window.confirm("Clear your reconciliations, balances, expenses and snapshots? Plan assumptions stay.")) { setRecs({}); setSnapshots([]); setTxns([]); setBalances({ everyday: "", anzplus: "3000", emergency: "", holiday: "3100", shares: "3546.50", superb: "19790.73", cc: "190.60", hecs: "45182.77" }); flash("Data cleared"); } };

  const TABS = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "expenses", label: "Expenses", icon: Receipt },
    { id: "reconcile", label: "Reconcile", icon: ScrollText },
    { id: "accounts", label: "Accounts", icon: Landmark },
    { id: "plan", label: "Plan", icon: SlidersHorizontal },
  ];
  const selStyle = { padding: "7px 9px", border: `1px solid ${LINE}`, borderRadius: 8, fontFamily: "'Inter',sans-serif", fontSize: 13, color: NAVY, background: "#FCFBF7" };
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "7px 9px", border: `1px solid ${LINE}`, borderRadius: 8, fontFamily: "'Inter',sans-serif", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums", color: NAVY, background: "#FCFBF7" };
  const periodLabel = (p) => `${p.label} '${String(p.year).slice(2)}`;
  const filteredTxns = txns.filter((t) => txnFilter === "all" || periodKeyOf(t.date, anchor) === txnFilter).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const filterTotal = filteredTxns.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const byAccount = ACCOUNTS.map((acc) => ({ acc, total: filteredTxns.filter((t) => t.account === acc).reduce((s, t) => s + (Number(t.amount) || 0), 0) })).filter((x) => x.total > 0);
  const catLabel = (id) => (TXN_CATS.find((c) => c.id === id) || {}).label || id;

  return (
    <div style={{ background: PAPER, minHeight: "100vh", fontFamily: "'Inter',system-ui,sans-serif", color: NAVY }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
        * { -webkit-font-smoothing: antialiased; box-sizing: border-box; }
        input:focus, select:focus { outline: 2px solid ${GOLD}; outline-offset: 0; }
        .tabbtn:hover { filter: brightness(1.15); }
        .ledger-row:hover { background: #FAF7EE; }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: ${LINE}; border-radius: 8px; }
        @media (max-width: 680px) { input, select { font-size: 16px !important; } }
      `}</style>

      {/* header */}
      <div style={{ background: `linear-gradient(120deg, ${INK}, ${NAVY} 70%)`, color: "#fff", padding: isMobile ? "16px 16px 0" : "22px 26px 0", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: isMobile ? 10.5 : 12, letterSpacing: ".14em", textTransform: "uppercase", color: GOLD, fontWeight: 600 }}>West Carr &amp; Harvey · Fortnightly</div>
              <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: "4px 0 0" }}>The Reconciliation</h1>
              {!isMobile && <div style={{ fontSize: 13, color: "#B9C2D6", marginTop: 2 }}>Reconciled each fortnight, when you get paid. Plan is the budget; your numbers are the actuals.</div>}
            </div>
            <button onClick={resetData} className="tabbtn" style={{ background: "transparent", border: `1px solid ${NAVY2}`, color: "#9FB0CE", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <RotateCcw size={13} /> Reset
            </button>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: isMobile ? 12 : 18, overflowX: "auto", scrollbarWidth: "none" }}>
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} className="tabbtn" style={{ flexShrink: 0, background: on ? PAPER : "transparent", color: on ? NAVY : "#9FB0CE", border: "none", borderRadius: "10px 10px 0 0", padding: isMobile ? "9px 13px" : "10px 18px", fontSize: isMobile ? 12.5 : 13.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Space Grotesk',sans-serif" }}>
                  <t.icon size={15} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: isMobile ? "16px 14px 60px" : "22px 26px 60px" }}>

        {/* ===== OVERVIEW ===== */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: isMobile ? "12px 14px" : "12px 18px", alignItems: "center" }}>
              {[["Log", "expenses", "each purchase as it happens", Receipt], ["Close", "reconcile", "actual vs plan each payday", ScrollText], ["Track", "accounts", "snapshot balances to plot", Camera]].map(([step, tabId, desc, Icon], i) => (
                <React.Fragment key={step}>
                  <button onClick={() => setTab(tabId)} style={{ display: "flex", alignItems: "center", gap: 9, background: "transparent", border: "none", cursor: "pointer", padding: 2, textAlign: "left", flex: isMobile ? "1 1 100%" : "0 1 auto" }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: "#F1ECDD", color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={16} /></span>
                    <span><span style={{ fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: MUTE, display: "block" }}>{i + 1} · {step}</span><span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 13.5, color: NAVY, textTransform: "capitalize" }}>{tabId}</span> <span style={{ fontSize: 12, color: MUTE }}>— {desc}</span></span>
                  </button>
                  {!isMobile && i < 2 && <span style={{ color: LINE, fontSize: 18 }}>→</span>}
                </React.Fragment>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Metric icon={Wallet} label="Net pay / fortnight" value={AUD(D.netFTfn)} sub="full-time, after tax & HECS" />
              <Metric icon={TrendingUp} label="Planned surplus / fn" value={AUD(D.netFTfn - D.expFN(2027))} sub="2027+, all costs running" />
              <Metric icon={PiggyBank} label="Emergency fund" value={AUD(num(balances.emergency))} sub={`target ${AUD(plan.emergency)}`} accent={FAV} />
              <Metric icon={Home} label="Deposit saved" value={AUD(num(balances.anzplus))} sub={`5% goal ${AUD(D.dep5)}`} />
            </div>

            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "18px 18px 6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, flexWrap: "wrap", gap: 4 }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 16 }}>Road to the deposit</div>
                <div style={{ fontSize: 12, color: MUTE }}>gold line = 5% goal · dots = your snapshots</div>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 10, left: 6, bottom: 0 }}>
                  <CartesianGrid stroke="#EFEBDD" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTE }} interval={isMobile ? 12 : 7} tickLine={false} axisLine={{ stroke: LINE }} />
                  <YAxis tickFormatter={(v) => `$${v / 1000}k`} tick={{ fontSize: 11, fill: MUTE }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip formatter={(v) => (v == null ? "—" : AUD(v))} contentStyle={{ borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 12, fontFamily: "Inter" }} />
                  <ReferenceLine y={D.dep5} stroke={GOLD} strokeDasharray="5 4" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="planDeposit" name="Planned deposit" stroke={NAVY} strokeWidth={2.4} dot={false} />
                  <Scatter dataKey="actualDeposit" name="Actual" fill={FAV} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, flex: "1 1 320px" }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Where the money goes</div>
                <div style={{ fontSize: 11.5, color: MUTE, marginTop: -4, marginBottom: 6 }}>per fortnight</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" innerRadius={48} outerRadius={80} paddingAngle={1} stroke="none">
                        {pieData.map((e, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => AUD(v)} contentStyle={{ borderRadius: 10, border: `1px solid ${LINE}`, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1, minWidth: 150, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 10px" }}>
                    {pieData.map((d, i) => (
                      <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: MUTE }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                        {d.name} <span style={{ marginLeft: "auto", color: NAVY, fontVariantNumeric: "tabular-nums" }}>{pieTotal > 0 ? ((d.value / pieTotal) * 100).toFixed(0) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 16 }}>Goal progress</div>
                <Progress label="Emergency fund" value={num(balances.emergency)} target={num(plan.emergency)} colorFrom={FAV} />
                <Progress label="House deposit (5%)" value={num(balances.anzplus)} target={D.dep5} />
                <div style={{ fontSize: 11.5, color: MUTE, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
                  Edit the baseline on <b style={{ color: NAVY }}>Plan</b>; log balances on <b style={{ color: NAVY }}>Accounts</b> and hit <b style={{ color: NAVY }}>Snapshot</b> to plot a dot.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== EXPENSES ===== */}
        {tab === "expenses" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 16, marginBottom: 12 }}>Log an expense</div>
              {isMobile ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Field label="Amount"><div style={{ display: "flex", alignItems: "center", gap: 4, border: `1px solid ${LINE}`, borderRadius: 8, background: "#FCFBF7", padding: "4px 10px" }}><span style={{ color: MUTE, fontSize: 20 }}>$</span><input type="number" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} style={{ border: "none", background: "transparent", outline: "none", width: "100%", fontSize: 22, fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif", color: NAVY, textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "6px 0" }} /></div></Field>
                  <Field label="Description"><input type="text" placeholder="e.g. Woolworths" value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} style={{ ...selStyle, width: "100%", textAlign: "left", height: 42 }} /></Field>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Field label="Category" grow><select value={form.catId} onChange={(e) => setForm((f) => ({ ...f, catId: e.target.value }))} style={{ ...selStyle, width: "100%", height: 42 }}>{TXN_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
                    <Field label="Account / card" grow><select value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))} style={{ ...selStyle, width: "100%", height: 42 }}>{ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
                  </div>
                  <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ ...selStyle, width: "100%", height: 42 }} /></Field>
                  <button onClick={addTxn} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, background: GOLD, color: INK, border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif" }}><Plus size={18} /> Add expense</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ ...selStyle, width: 150 }} /></Field>
                  <Field label="Description" grow><input type="text" placeholder="e.g. Woolworths" value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} style={{ ...selStyle, width: "100%", textAlign: "left" }} /></Field>
                  <Field label="Amount"><div style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ color: MUTE, fontSize: 13 }}>$</span><input type="number" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addTxn()} style={{ ...selStyle, width: 100, textAlign: "right", fontVariantNumeric: "tabular-nums" }} /></div></Field>
                  <Field label="Category"><select value={form.catId} onChange={(e) => setForm((f) => ({ ...f, catId: e.target.value }))} style={{ ...selStyle, width: 140 }}>{TXN_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
                  <Field label="Account / card"><select value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))} style={{ ...selStyle, width: 140 }}>{ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
                  <button onClick={addTxn} style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: INK, border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif", height: 36 }}><Plus size={15} /> Add</button>
                </div>
              )}
              {flashMsg && <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginTop: 10 }}>{flashMsg}</div>}
            </div>

            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 640px" }}>
                <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${LINE}`, gap: 8 }}>
                    <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 16 }}>Transactions</div>
                    <select value={txnFilter} onChange={(e) => setTxnFilter(e.target.value)} style={selStyle}>
                      <option value="all">All fortnights</option>
                      {PERIODS.map((p) => <option key={p.key} value={p.key}>{periodLabel(p)}</option>)}
                    </select>
                  </div>
                  {filteredTxns.length === 0 ? (
                    <div style={{ padding: 24, fontSize: 13, color: MUTE, textAlign: "center" }}>No expenses logged yet. Add one above — it flows into the matching category on the Reconcile tab for its fortnight.</div>
                  ) : isMobile ? (
                    <div>
                      {filteredTxns.map((t) => (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${LINE}` }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: ACC_COLOR[t.account] || MUTE, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.desc || catLabel(t.catId)}</div>
                            <div style={{ fontSize: 11, color: MUTE, marginTop: 1 }}>{(t.date || "").slice(5)} · {catLabel(t.catId)} · {t.account}</div>
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{AUD(Number(t.amount), 2)}</span>
                          <button onClick={() => delTxn(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C2B4", padding: 8, display: "flex" }}><Trash2 size={16} /></button>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "13px 14px", background: "#F4EFE1", borderTop: `2px solid ${GOLD}`, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700 }}><span>Total</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(filterTotal, 2)}</span></div>
                    </div>
                  ) : (
                    <div>
                      {filteredTxns.map((t) => (
                        <div key={t.id} className="ledger-row" style={{ display: "grid", gridTemplateColumns: "84px 1fr 108px 120px 96px 34px", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
                          <span style={{ color: MUTE, fontVariantNumeric: "tabular-nums" }}>{(t.date || "").slice(5)}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.desc || <span style={{ color: "#C7C2B4" }}>—</span>}</span>
                          <span style={{ fontSize: 11.5, color: MUTE }}>{catLabel(t.catId)}</span>
                          <span style={{ fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: ACC_COLOR[t.account] || MUTE }} />{t.account}</span>
                          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{AUD(Number(t.amount), 2)}</span>
                          <button onClick={() => delTxn(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C7C2B4", display: "flex", justifyContent: "center" }}><Trash2 size={14} /></button>
                        </div>
                      ))}
                      <div style={{ display: "grid", gridTemplateColumns: "84px 1fr 108px 120px 96px 34px", padding: "11px 14px", background: "#F4EFE1", borderTop: `2px solid ${GOLD}`, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700 }}>
                        <span style={{ gridColumn: "1 / 5" }}>Total {txnFilter === "all" ? "(all)" : ""}</span>
                        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{AUD(filterTotal, 2)}</span><span />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>By account / card</div>
                  {byAccount.length === 0 ? <div style={{ fontSize: 12.5, color: MUTE }}>Nothing logged for this filter.</div> : byAccount.map((x) => (
                    <div key={x.acc} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 13 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: ACC_COLOR[x.acc] || MUTE }} />{x.acc}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{AUD(x.total, 2)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: `linear-gradient(120deg, ${INK}, ${NAVY})`, borderRadius: 14, padding: 16, fontSize: 12, color: "#C4CDE0", lineHeight: 1.55 }}>
                  Each expense auto-fills the matching line on <b style={{ color: GOLD_SOFT }}>Reconcile</b> for its fortnight. Type a manual actual there only to override the logged total.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== RECONCILE ===== */}
        {tab === "reconcile" && perObj && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 18 }}>Fortnight rec</div>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ padding: "8px 12px", border: `1px solid ${LINE}`, borderRadius: 8, background: CARD, fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, color: NAVY, fontWeight: 600 }}>
                {PERIODS.map((p) => <option key={p.key} value={p.key}>{periodLabel(p)}</option>)}
              </select>
              <span style={{ fontSize: 12, color: MUTE, padding: "3px 10px", background: "#EFE9D9", borderRadius: 999 }}>{isFT(perObj) ? "Full-time" : "Part-time"}</span>
              {anyActual && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: FAV, fontWeight: 600 }}><Check size={14} /> Reconciled</span>}
              {flashMsg && <span style={{ fontSize: 12, color: GOLD, fontWeight: 600 }}>{flashMsg}</span>}
            </div>

            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
              {!isMobile && (
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", background: NAVY, color: "#fff", fontSize: 11.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>
                  <div style={{ padding: "11px 16px" }}>Line</div><div style={{ padding: "11px 16px", textAlign: "right" }}>Planned</div><div style={{ padding: "11px 16px", textAlign: "right" }}>Actual</div><div style={{ padding: "11px 16px", textAlign: "right" }}>Variance</div>
                </div>
              )}
              <Row isMobile={isMobile} label="Net pay" plan={planInc} isIncome
                actualEl={<input style={inputStyle} type="number" inputMode="decimal" placeholder={planInc.toFixed(0)} value={rec.income} onChange={(e) => setRec({ income: e.target.value })} onBlur={() => flash()} />}
                variance={actInc === null ? null : actInc - planInc} />
              <div style={{ padding: "8px 16px 4px", fontSize: 11, letterSpacing: ".05em", textTransform: "uppercase", color: MUTE, background: "#FBF9F2" }}>Expenses</div>
              {catRows.map((r) => (
                <Row key={r.id} isMobile={isMobile} label={r.label} plan={r.plan} expense variance={r.variance}
                  actualEl={<div><input style={inputStyle} type="number" inputMode="decimal" placeholder={(r.logged > 0 ? r.logged : r.plan).toFixed(0)} value={rec.actuals[r.id] ?? ""} onChange={(e) => setActual(r.id, e.target.value)} onBlur={() => flash()} />{r.logged > 0 && !r.hasManual && <div style={{ fontSize: 10, color: FAV, textAlign: "right", marginTop: 2 }}>{AUD(r.logged)} from Expenses</div>}</div>} />
              ))}
              {isMobile ? (
                <div style={{ background: "#F4EFE1", borderTop: `2px solid ${GOLD}`, padding: "12px 14px", fontFamily: "'Space Grotesk',sans-serif" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}><span>Total expenses</span>{anyActual ? <VarTag v={expVar} /> : <span style={{ color: MUTE }}>—</span>}</div>
                  <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 12, color: MUTE }}><span>Plan {AUD(totPlanExp)}</span><span>Actual {anyActual ? AUD(totActExp) : "—"}</span></div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", background: "#F4EFE1", borderTop: `2px solid ${GOLD}`, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>
                  <Cell2>Total expenses</Cell2><Cell2 right>{AUD(totPlanExp)}</Cell2><Cell2 right>{anyActual ? AUD(totActExp) : "—"}</Cell2><Cell2 right>{anyActual ? <VarTag v={expVar} /> : "—"}</Cell2>
                </div>
              )}
            </div>

            <div style={{ background: `linear-gradient(120deg, ${INK}, ${NAVY})`, color: "#fff", borderRadius: 14, padding: "18px 20px", display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: GOLD_SOFT }}>Surplus this fortnight</div>
                <div style={{ display: "flex", gap: 26, marginTop: 6 }}>
                  <Stat k="Planned" v={AUD(planSurplus)} />
                  <Stat k="Actual" v={anyActual ? AUD(actSurplus) : "—"} />
                  <Stat k="Variance" v={anyActual ? (surplusVar >= 0 ? "+" : "−") + AUD(Math.abs(surplusVar)) : "—"} color={anyActual ? (surplusVar >= 0 ? "#7BE0AE" : "#F0A08C") : "#fff"} />
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: "#C4CDE0", maxWidth: 300, lineHeight: 1.5 }}>A <b style={{ color: "#7BE0AE" }}>favourable</b> variance means you spent less than planned this pay — extra to push to the deposit.</div>
            </div>
          </div>
        )}

        {/* ===== ACCOUNTS ===== */}
        {tab === "accounts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 20, flex: "1 1 340px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 16 }}>Current balances</div>
                  <button onClick={takeSnapshot} style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: INK, border: "none", borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif" }}><Camera size={14} /> Snapshot</button>
                </div>
                {[["everyday", "Everyday account"], ["anzplus", "ANZ Plus — deposit"], ["emergency", "Emergency fund"], ["holiday", "Holiday (cruise)"], ["shares", "Shares (CMC)"], ["superb", "Super (UniSuper)"], ["cc", "Credit card (owing)"], ["hecs", "HECS-HELP (owing)"]].map(([k, lbl]) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
                    <span style={{ fontSize: 13, color: k === "cc" || k === "hecs" ? UNFAV : NAVY }}>{lbl}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, width: 140 }}><span style={{ color: MUTE, fontSize: 13 }}>$</span><input type="number" inputMode="decimal" value={balances[k]} onChange={(e) => setBalances((pp) => ({ ...pp, [k]: e.target.value }))} onBlur={() => flash()} style={inputStyle} /></div>
                  </div>
                ))}
                {flashMsg && <div style={{ fontSize: 12, color: GOLD, fontWeight: 600, marginTop: 8 }}>{flashMsg}</div>}
              </div>
              <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: `linear-gradient(120deg, ${INK}, ${NAVY})`, color: "#fff", borderRadius: 14, padding: 20 }}>
                  <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: GOLD_SOFT }}>Net position</div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums", color: net >= 0 ? "#fff" : "#F0A08C" }}>{net < 0 ? "−" : ""}{AUD(Math.abs(net))}</div>
                  <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 12.5 }}><Stat k="Assets" v={AUD(assets)} color="#7BE0AE" /><Stat k="Debts" v={AUD(liabilities)} color="#F0A08C" /></div>
                  <div style={{ fontSize: 11.5, color: "#B9C2D6", marginTop: 12, lineHeight: 1.5 }}>Negative today is normal for a new grad — HECS is the cheapest debt you'll hold. It flips positive as the deposit grows.</div>
                </div>
                <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                  <Progress label="Emergency fund" value={num(balances.emergency)} target={num(plan.emergency)} colorFrom={FAV} />
                  <Progress label="House deposit (5%)" value={num(balances.anzplus)} target={D.dep5} />
                </div>
              </div>
            </div>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>Snapshot history</div>
              {snapshots.length === 0 ? (
                <div style={{ fontSize: 13, color: MUTE }}>No snapshots yet. Enter balances above and hit <b style={{ color: NAVY }}>Snapshot</b> — each drops a dot on the Overview chart.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {snapshots.map((s) => (
                    <div key={s.key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", fontSize: 13, padding: "7px 4px", borderBottom: `1px solid ${LINE}`, fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: MUTE }}>{s.when}</span><span>Deposit {AUD(s.deposit)}</span><span>Emergency {AUD(s.emergency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== PLAN ===== */}
        {tab === "plan" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 18 }}>Plan assumptions</div>
                <div style={{ fontSize: 12.5, color: MUTE }}>Edit these and the whole app recalculates. {flashMsg && <b style={{ color: GOLD }}>{flashMsg}</b>}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={copyForClaude} style={{ display: "flex", alignItems: "center", gap: 6, background: NAVY, color: "#fff", border: "none", borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif" }}><Copy size={14} /> Copy figures for Claude</button>
                <button onClick={restoreDefaults} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: MUTE, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><RotateCcw size={14} /> Restore baseline</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 18 }}>
                <Panel title="Pay cycle" icon={CalendarClock}>
                  <PInput label="First pay period starts" type="date" value={plan.payAnchor} onChange={(v) => setP("payAnchor", v)} />
                  <PInput label="Full-time from" type="date" value={plan.ftStart} onChange={(v) => setP("ftStart", v)} />
                  <Derived rows={[["Net pay / fortnight (FT)", AUD(D.netFTfn)], ["Net pay / fortnight (PT)", AUD(D.netPTfn)], ["Super / fortnight (FT)", AUD(D.superFTfn)]]} />
                </Panel>
                <Panel title="Employment & tax">
                  <PInput label="Salary package (incl. super)" prefix="$" value={plan.package} onChange={(v) => setP("package", v)} />
                  <PInput label="Super rate" suffix="%" value={plan.sg * 100} onChange={(v) => setP("sg", (Number(v) || 0) / 100)} />
                  <PInput label="Part-time fraction" suffix="%" value={plan.ptFrac * 100} onChange={(v) => setP("ptFrac", (Number(v) || 0) / 100)} />
                  <PInput label="HECS repayment threshold" prefix="$" value={plan.hecsThreshold} onChange={(v) => setP("hecsThreshold", v)} />
                  <Derived rows={[["Cash salary (FT, / yr)", AUD(D.cashFT)], ["Net pay / month (FT)", AUD(D.netFTmo)]]} />
                </Panel>
                <Panel title="Goals & house">
                  <PInput label="House-and-land target" prefix="$" value={plan.house} onChange={(v) => setP("house", v)} />
                  <PInput label="Deposit required" suffix="%" value={plan.depPct * 100} onChange={(v) => setP("depPct", (Number(v) || 0) / 100)} />
                  <PInput label="First Home Owner Grant" prefix="$" value={plan.fhog} onChange={(v) => setP("fhog", v)} />
                  <PInput label="Other buying costs" prefix="$" value={plan.costs} onChange={(v) => setP("costs", v)} />
                  <PInput label="Emergency fund target" prefix="$" value={plan.emergency} onChange={(v) => setP("emergency", v)} />
                  <PInput label="Opening deposit (ANZ Plus)" prefix="$" value={plan.openDeposit} onChange={(v) => setP("openDeposit", v)} />
                  <Derived rows={[["Deposit at 5%", AUD(D.dep5)], ["Net cash to save", AUD(D.netCash)]]} />
                </Panel>
              </div>
              <div style={{ flex: "1 1 380px" }}>
                <Panel title="Monthly expenses">
                  <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 6, alignItems: "center", marginBottom: 4 }}>
                    <span /><span style={{ fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", textAlign: "right" }}>2026 (now)</span><span style={{ fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", textAlign: "right" }}>2027 +</span>
                  </div>
                  {CAT_META.map((c) => (
                    <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 6, alignItems: "center", padding: "3px 0" }}>
                      <span style={{ fontSize: 13 }}>{c.label}</span>
                      <input type="number" inputMode="decimal" value={plan.cats[c.id].a26} onChange={(e) => setCat(c.id, "a26", e.target.value)} onBlur={() => flash()} style={inputStyle} />
                      <input type="number" inputMode="decimal" value={plan.cats[c.id].a27} onChange={(e) => setCat(c.id, "a27", e.target.value)} onBlur={() => flash()} style={inputStyle} />
                    </div>
                  ))}
                  <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 6, marginTop: 8, paddingTop: 8, borderTop: `2px solid ${GOLD}`, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    <span>Total / mo</span><span style={{ textAlign: "right" }}>{AUD(D.expMo(2026))}</span><span style={{ textAlign: "right" }}>{AUD(D.expMo(2027))}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 6, marginTop: 4, fontSize: 12, color: MUTE, fontVariantNumeric: "tabular-nums" }}>
                    <span>Per fortnight</span><span style={{ textAlign: "right" }}>{AUD(D.expFN(2026))}</span><span style={{ textAlign: "right" }}>{AUD(D.expFN(2027))}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: MUTE, marginTop: 10, lineHeight: 1.5 }}>Enter monthly figures; the rec converts them to a fortnightly budget (× 12 ÷ 26). Board and private health start in the 2027 column. Editing here won't touch your Excel — use <b style={{ color: NAVY }}>Copy figures for Claude</b> to resync it.</div>
                </Panel>
              </div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 11, color: MUTE, marginTop: 26, textAlign: "center", lineHeight: 1.6 }}>General information to help you track, not financial advice. Your edits and entries persist between sessions in this artifact.</div>
      </div>
    </div>
  );
}

/* ---------- atoms ---------- */
function Row({ label, plan: p, actualEl, variance, isIncome, expense, isMobile }) {
  if (isMobile) {
    return (
      <div style={{ padding: "11px 14px", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: isIncome ? 700 : 600 }}>{label}</span>
          {variance === null ? <span style={{ fontSize: 12, color: "#C7C2B4" }}>—</span> : <VarTag v={variance} />}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: MUTE, flexShrink: 0, width: 82 }}>Plan {AUD(p)}</span>
          <div style={{ flex: 1 }}>{actualEl}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="ledger-row" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", alignItems: "center", borderBottom: `1px solid ${LINE}` }}>
      <div style={{ padding: "9px 16px", fontSize: 13.5, fontWeight: isIncome ? 600 : 400 }}>{label}</div>
      <div style={{ padding: "9px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13.5, color: MUTE }}>{AUD(p)}</div>
      <div style={{ padding: "6px 12px" }}>{actualEl}</div>
      <div style={{ padding: "9px 16px", textAlign: "right" }}>{variance === null ? <span style={{ color: "#C7C2B4" }}>—</span> : <VarTag v={variance} />}</div>
    </div>
  );
}
function Metric({ icon: Icon, label, value, sub, accent = GOLD }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: "16px 18px", flex: 1, minWidth: 150 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: MUTE, fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" }}><Icon size={14} color={accent} /> {label}</div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 600, color: NAVY, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function Progress({ value, target, colorFrom = GOLD, label }) {
  const pct = target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTE, marginBottom: 6 }}><span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{AUD(value)} / {AUD(target)} · {pct.toFixed(0)}%</span></div>
      <div style={{ height: 10, background: "#EEEADD", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${colorFrom}, ${GOLD_SOFT})`, transition: "width .5s" }} /></div>
    </div>
  );
}
function Field({ label, children, grow }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: grow ? "1 1 120px" : "0 0 auto", minWidth: grow ? 120 : "auto" }}>
      <span style={{ fontSize: 10.5, color: MUTE, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  );
}
function Panel({ title, children, icon: Icon }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 14, padding: 18 }}>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 15, marginBottom: 12, color: NAVY, display: "flex", alignItems: "center", gap: 7 }}>{Icon && <Icon size={16} color={GOLD} />}{title}</div>
      {children}
    </div>
  );
}
function PInput({ label, value, onChange, prefix, suffix, type = "number" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "5px 0" }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 3, width: type === "date" ? 150 : 130 }}>
        {prefix && <span style={{ color: MUTE, fontSize: 13 }}>{prefix}</span>}
        <input type={type} inputMode={type === "number" ? "decimal" : undefined} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", border: `1px solid ${LINE}`, borderRadius: 8, fontFamily: "'Inter',sans-serif", fontSize: 13, textAlign: type === "date" ? "left" : "right", fontVariantNumeric: "tabular-nums", color: NAVY, background: "#FCFBF7" }} />
        {suffix && <span style={{ color: MUTE, fontSize: 13 }}>{suffix}</span>}
      </div>
    </div>
  );
}
function Derived({ rows }) {
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LINE}`, display: "flex", flexDirection: "column", gap: 5 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span style={{ color: MUTE }}>{k}</span><span style={{ fontWeight: 600, color: FAV, fontVariantNumeric: "tabular-nums", fontFamily: "'Space Grotesk',sans-serif" }}>{v}</span></div>
      ))}
    </div>
  );
}
function VarTag({ v }) {
  const color = Math.abs(v) < 0.005 ? MUTE : v >= 0 ? FAV : UNFAV;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13.5, fontWeight: 600, color }}>{sign}{AUD(Math.abs(v))}</span>;
}
function Cell2({ children, right }) {
  return <div style={{ padding: "12px 16px", textAlign: right ? "right" : "left", fontVariantNumeric: "tabular-nums", color: NAVY }}>{children}</div>;
}
function Stat({ k, v, color = "#fff" }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#9FB0CE" }}>{k}</div>
      <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 600, color, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{v}</div>
    </div>
  );
}
