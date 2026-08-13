// Fortnightly pay-period engine — ported from FinancialPlanTracker.jsx (spec §2).
//
// All date math runs in UTC. The prototype paired `new Date(s + "T00:00:00")` (local time)
// with `.toISOString()` (UTC) — in a timezone ahead of UTC (e.g. Australia) that pairing
// silently shifts the computed date back a day. This app renders the same period math on
// the server (Vercel, UTC) and in the browser (any timezone), so period boundaries must be
// timezone-independent to avoid hydration mismatches and off-by-one-day period keys.

const DAY_MS = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const LAST_PERIOD_CUTOFF = "2029-12-31";

export function dateFromISO(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function isoFromDate(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function dayLabel(dt: Date): string {
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

export interface Period {
  idx: number;
  key: string; // ISO start date, e.g. "2026-08-24"
  start: Date;
  end: Date;
  label: string; // e.g. "24 Aug – 6 Sep"
  year: number;
}

export function buildPeriods(anchorStr: string, cutoffStr: string = LAST_PERIOD_CUTOFF): Period[] {
  const out: Period[] = [];
  const anchor = dateFromISO(anchorStr);
  const cutoff = dateFromISO(cutoffStr);
  let start = new Date(anchor);
  let idx = 0;
  while (start <= cutoff && idx < 130) {
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 13);
    out.push({
      idx,
      key: isoFromDate(start),
      start: new Date(start),
      end,
      label: `${dayLabel(start)} – ${dayLabel(end)}`,
      year: start.getUTCFullYear(),
    });
    start = new Date(start);
    start.setUTCDate(start.getUTCDate() + 14);
    idx++;
  }
  return out;
}

/** Maps any date to the ISO key of the fortnight period it falls in, or null if before the anchor. */
export function periodKeyOf(dateStr: string | null | undefined, anchorStr: string): string | null {
  if (!dateStr) return null;
  const anchor = dateFromISO(anchorStr);
  const d = dateFromISO(dateStr);
  const idx = Math.floor((d.getTime() - anchor.getTime()) / (14 * DAY_MS));
  if (idx < 0) return null;
  const s = new Date(anchor);
  s.setUTCDate(s.getUTCDate() + idx * 14);
  return isoFromDate(s);
}

/** The period covering today, or the nearest boundary period if today falls outside the plan's range. */
export function currentPeriod(periods: Period[], todayISO: string): Period {
  if (periods.length === 0) throw new Error("currentPeriod: no periods generated");
  const today = dateFromISO(todayISO);
  const found = periods.find((p) => today >= p.start && today <= p.end);
  if (found) return found;
  return today < periods[0].start ? periods[0] : periods[periods.length - 1];
}

/** Start (Jul 1) of the AU financial year containing the given date. */
export function financialYearStart(dateISO: string): string {
  const d = dateFromISO(dateISO);
  const year = d.getUTCFullYear();
  const julyThisYear = new Date(Date.UTC(year, 6, 1));
  return d >= julyThisYear ? isoFromDate(julyThisYear) : isoFromDate(new Date(Date.UTC(year - 1, 6, 1)));
}

export function isFT(periodKey: string, ftStartStr: string): boolean {
  return dateFromISO(periodKey) >= dateFromISO(ftStartStr);
}

export function periodLabel(p: Period): string {
  return `${p.label} '${String(p.year).slice(2)}`;
}
