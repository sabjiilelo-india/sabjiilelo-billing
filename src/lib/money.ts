/** Parse a rupee string like "12.5" into paise. Returns NaN for invalid input. */
export function rupeesToPaise(v: string | number): number {
  const s = String(v ?? "").trim();
  if (s === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [r, p = ""] = s.split(".");
  return Number(r) * 100 + Number(p.padEnd(2, "0"));
}

export function paiseToRupees(p: number): string {
  const sign = p < 0 ? "-" : "";
  const a = Math.abs(p);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

const fmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatINR(p: number): string {
  return "₹" + fmt.format(p / 100);
}

export function formatNum(p: number): string {
  return fmt.format(p / 100);
}
