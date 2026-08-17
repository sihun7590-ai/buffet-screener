// Maps our ticker format (SEC/Yahoo-style, e.g. "BRK-B") to TradingView's
// "EXCHANGE:SYMBOL" format (e.g. "NYSE:BRK.B") for the embedded chart widget.
const EXCHANGE_MAP: Record<string, string> = {
  NMS: "NASDAQ", // Nasdaq Global Select
  NGM: "NASDAQ", // Nasdaq Global Market
  NCM: "NASDAQ", // Nasdaq Capital Market
  NYQ: "NYSE",
  ASE: "AMEX",
  PCX: "AMEX",
  BATS: "BATS",
};

const YF_USER_AGENT = "Mozilla/5.0 (compatible; buffett-screener research tool)";

export async function fetchExchangeName(ticker: string): Promise<string | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`, {
      headers: { "User-Agent": YF_USER_AGENT },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.chart?.result?.[0]?.meta?.exchangeName ?? null;
  } catch {
    return null;
  }
}

export function toTradingViewSymbol(ticker: string, exchangeName: string | null): string {
  const tvTicker = ticker.replace(/-/g, "."); // BRK-B -> BRK.B
  const prefix = exchangeName ? EXCHANGE_MAP[exchangeName] : null;
  return prefix ? `${prefix}:${tvTicker}` : tvTicker;
}
