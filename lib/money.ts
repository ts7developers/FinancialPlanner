export function AUD(n: number, dp = 0): string {
  return (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function num(v: string | number | undefined | null): number {
  if (v === "" || v === undefined || v === null) return 0;
  return Number(v) || 0;
}
