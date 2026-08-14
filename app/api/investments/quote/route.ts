// Fetches delayed ASX quotes for the Investments panel. Uses Yahoo Finance's unofficial
// chart endpoint — no API key, no cost, but undocumented and best-effort: if it errors or
// changes shape, individual codes just fail to price rather than breaking the whole refresh.
import { NextResponse } from "next/server";

interface Quote {
  code: string;
  price: number | null;
  changePct: number | null;
  error?: boolean;
}

async function fetchQuote(code: string): Promise<Quote> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}.AX`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!res.ok) return { code, price: null, changePct: null, error: true };
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const prevClose = typeof meta?.chartPreviousClose === "number" ? meta.chartPreviousClose : meta?.previousClose;
    const changePct = price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
    if (price == null) return { code, price: null, changePct: null, error: true };
    return { code, price, changePct };
  } catch {
    return { code, price: null, changePct: null, error: true };
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const codes: unknown = body?.codes;
  if (!Array.isArray(codes) || codes.length === 0 || !codes.every((c) => typeof c === "string")) {
    return NextResponse.json({ error: "codes must be a non-empty string array" }, { status: 400 });
  }
  const results = await Promise.all(codes.slice(0, 30).map((c) => fetchQuote(c)));
  return NextResponse.json({ results });
}
