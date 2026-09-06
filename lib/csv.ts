// Bank-statement CSV import — pure parsing/detection logic, kept separate from the upload UI
// (components/ImportCsvPanel.tsx) so it's independently testable, same convention as period.ts/tax.ts.

import { dateFromISO, isoFromDate } from "./period";
import type { RecurringFrequency } from "./types";

/** Minimal RFC4180-ish parser: quoted fields, escaped `""`, commas/newlines inside quotes, CRLF or LF. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** Accepts ISO (2026-08-14), AU-style DD/MM/YYYY or DD-MM-YYYY, and 2-digit-year variants. Returns null if unrecognized. */
export function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = Number(y) < 70 ? 2000 + Number(y) : 1900 + Number(y);
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/** Strips currency symbols/commas/whitespace and handles accounting-style `(12.34)` negatives. Returns null if not numeric. */
export function parseAmount(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const isParenNegative = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[()$,\s]/g, "").replace(/^\+/, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return isParenNegative ? -Math.abs(n) : n;
}

export interface ParsedBankRow {
  /** ISO date, or null if the date column's value couldn't be parsed. */
  date: string | null;
  description: string;
  /** Always positive — the expense amount, or null if this row isn't a debit (e.g. it's a credit/refund) or the amount couldn't be parsed. */
  amount: number | null;
  rawDate: string;
  rawAmount: string;
}

export interface ParseBankCSVResult {
  rows: ParsedBankRow[];
  dateColumn: string | null;
  descColumn: string | null;
  amountColumn: string | null;
  debitColumn: string | null;
  /** Null header set + a human-readable reason when the file couldn't be understood at all. */
  error: string | null;
}

const EMPTY_RESULT: ParseBankCSVResult = { rows: [], dateColumn: null, descColumn: null, amountColumn: null, debitColumn: null, error: null };

/**
 * Detects a Date + Description + (Amount, negative-for-debit) or (Debit/Credit split) header —
 * the two most common bank/card export shapes — and normalizes every row to a positive expense
 * amount (or null if the row is a credit/refund, so it's excluded from an expense import by
 * default). If every "Amount" value in the file is non-negative, treats them all as debits
 * instead — some card exports list purchases as plain positive amounts with no sign convention.
 */
export function parseBankCSV(text: string): ParseBankCSVResult {
  const table = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return { ...EMPTY_RESULT, error: "That file doesn't have any data rows." };

  const header = table[0].map((h) => h.trim());
  const lower = header.map((h) => h.toLowerCase());
  const dateIdx = lower.findIndex((h) => h.includes("date"));
  const descIdx = lower.findIndex((h) => /desc|narrative|detail|merchant|reference|particular/.test(h));
  const amountIdx = lower.findIndex((h) => h === "amount" || h === "value");
  const debitIdx = lower.findIndex((h) => h.includes("debit"));

  if (dateIdx === -1) return { ...EMPTY_RESULT, error: "Couldn't find a date column in the header." };
  if (descIdx === -1) return { ...EMPTY_RESULT, error: "Couldn't find a description column in the header." };
  if (amountIdx === -1 && debitIdx === -1) return { ...EMPTY_RESULT, error: "Couldn't find an amount or debit column in the header." };

  const dataRows = table.slice(1);
  const anyNegativeAmount = amountIdx !== -1 && dataRows.some((cols) => (parseAmount(cols[amountIdx] ?? "") ?? 0) < 0);

  const rows: ParsedBankRow[] = dataRows.map((cols) => {
    const rawDate = cols[dateIdx] ?? "";
    const description = (cols[descIdx] ?? "").trim();
    let amount: number | null = null;
    let rawAmount = "";
    if (amountIdx !== -1) {
      rawAmount = cols[amountIdx] ?? "";
      const parsed = parseAmount(rawAmount);
      if (parsed !== null) amount = anyNegativeAmount ? (parsed < 0 ? Math.abs(parsed) : null) : parsed > 0 ? parsed : null;
    } else if (debitIdx !== -1) {
      rawAmount = cols[debitIdx] ?? "";
      const parsed = parseAmount(rawAmount);
      amount = parsed !== null && parsed > 0 ? parsed : null;
    }
    return { date: parseFlexibleDate(rawDate), description, amount, rawDate, rawAmount };
  });

  return {
    rows,
    dateColumn: header[dateIdx],
    descColumn: header[descIdx],
    amountColumn: amountIdx !== -1 ? header[amountIdx] : null,
    debitColumn: debitIdx !== -1 ? header[debitIdx] : null,
    error: null,
  };
}

/** Same date and amount (to the cent) as something already logged — likely the same transaction re-imported. */
export function isLikelyDuplicateTransaction(date: string, amount: number, existing: { date: string; amount: number }[]): boolean {
  return existing.some((t) => t.date === date && Math.abs((Number(t.amount) || 0) - amount) < 0.005);
}

/** Quotes a field only when it actually needs it (contains a comma, quote, or newline) — doubling any embedded quotes, per RFC4180. */
export function escapeCSVField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Builds a CSV document (CRLF line endings, per RFC4180) from a header row and data rows — the inverse of `parseCSV`. */
export function toCSV(header: string[], rows: (string | number)[][]): string {
  const lines = [header, ...rows].map((row) => row.map((cell) => escapeCSVField(String(cell))).join(","));
  return lines.join("\r\n") + "\r\n";
}

export interface RecurringCandidate {
  description: string;
  amount: number;
  frequency: RecurringFrequency;
  occurrences: number;
  lastDate: string;
  /** Estimated next occurrence — lastDate plus the observed average gap. */
  nextDue: string;
}

// Tolerance bands around each frequency's nominal gap (in days) — wide enough to absorb a bank's
// processing-date jitter (a "monthly" subscription rarely lands exactly 30 days apart) without
// collapsing into a neighbouring band.
const FREQUENCY_BANDS: { min: number; max: number; frequency: RecurringFrequency }[] = [
  { min: 5, max: 9, frequency: "weekly" },
  { min: 12, max: 16, frequency: "fortnightly" },
  { min: 25, max: 35, frequency: "monthly" },
  { min: 80, max: 100, frequency: "quarterly" },
  { min: 350, max: 380, frequency: "yearly" },
];

/**
 * Groups CSV rows by (description, amount) and flags any group of 2+ whose dates fall roughly
 * evenly spaced into one of the standard recurring-bill cadences — a candidate to offer adding as
 * a real Recurring Expense instead of re-typing it by hand next time it shows up in a statement.
 * Skips anything that already looks like an existing recurring expense (substring match either
 * direction, case-insensitive) so it doesn't keep re-suggesting the same subscription forever.
 */
export function detectRecurringCandidates(rows: { date: string; description: string; amount: number }[], existingDescriptions: string[]): RecurringCandidate[] {
  const existingLower = existingDescriptions.map((d) => d.trim().toLowerCase());
  const groups = new Map<string, { date: string; description: string; amount: number }[]>();
  rows.forEach((r) => {
    const desc = r.description.trim();
    if (!desc) return;
    const key = `${desc.toLowerCase()}|${r.amount.toFixed(2)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });

  const candidates: RecurringCandidate[] = [];
  groups.forEach((group) => {
    if (group.length < 2) return;
    const sorted = group.slice().sort((a, b) => a.date.localeCompare(b.date));
    const dayMs = 86400000;
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((dateFromISO(sorted[i].date).getTime() - dateFromISO(sorted[i - 1].date).getTime()) / dayMs);
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const band = FREQUENCY_BANDS.find((f) => avgGap >= f.min && avgGap <= f.max);
    if (!band) return;

    const description = sorted[0].description.trim();
    if (existingLower.some((d) => d.includes(description.toLowerCase()) || description.toLowerCase().includes(d))) return;

    const lastDate = sorted[sorted.length - 1].date;
    const nextDate = new Date(dateFromISO(lastDate));
    nextDate.setUTCDate(nextDate.getUTCDate() + Math.round(avgGap));
    candidates.push({ description, amount: sorted[0].amount, frequency: band.frequency, occurrences: sorted.length, lastDate, nextDue: isoFromDate(nextDate) });
  });

  return candidates.sort((a, b) => b.occurrences - a.occurrences);
}
