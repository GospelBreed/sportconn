const SYMBOLS: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
};

/** Formats a value using the record's own currency (defaults to NGN, SportConn's base currency). */
export function formatMoney(value: number | null | undefined, currency = "NGN"): string {
  const symbol = SYMBOLS[currency] ?? currency + " ";
  return symbol + Math.round(Number(value || 0)).toLocaleString("en-US");
}

export function formatCompactMoney(value: number | null | undefined, currency = "NGN"): string {
  const symbol = SYMBOLS[currency] ?? currency + " ";
  const n = Number(value || 0);
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  return symbol + compact;
}
