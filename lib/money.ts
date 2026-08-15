export function AUD(n: number, dp = 0): string {
  return (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function num(v: string | number | undefined | null): number {
  if (v === "" || v === undefined || v === null) return 0;
  return Number(v) || 0;
}

/** Chart-axis label: plain dollars below $1k (fortnightly-scale figures), "$Xk" at $1k and above (deposit/net-worth-scale figures) — a flat "/1000" formatter renders a $577 fortnight budget as the confusing "$0.6k". */
export function AUDAxis(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return (n < 0 ? "-" : "") + "$" + Math.round(abs);
  return (n < 0 ? "-" : "") + "$" + Math.round(abs / 1000) + "k";
}
