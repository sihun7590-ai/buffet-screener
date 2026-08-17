// SEC EDGAR has no stock price data, so current/historical prices come from
// Yahoo Finance's unofficial (unauthenticated, no key) chart endpoint. One
// call per ticker returns ~9 years of daily closes, which covers both the
// current quote and the "price at each fiscal year-end" lookups used for
// historical P/E.
const YF_USER_AGENT = "Mozilla/5.0 (compatible; buffett-screener research tool)";

export interface PriceHistory {
  timestamps: number[]; // unix seconds
  closes: number[];
  currentPrice: number;
}

export async function fetchPriceHistory(ticker: string): Promise<PriceHistory> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 60 * 60 * 24 * 365 * 9;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&period1=${period1}&period2=${period2}`;

  const res = await fetch(url, { headers: { "User-Agent": YF_USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Yahoo Finance request failed (${res.status}) for ${ticker}`);
  }
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error(`No price data returned for ${ticker}`);
  }

  const timestamps: number[] = result.timestamp ?? [];
  const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
  const currentPrice: number = result.meta?.regularMarketPrice ?? closes[closes.length - 1];

  return { timestamps, closes, currentPrice };
}

export interface ChartPoint {
  date: string; // ISO date
  close: number;
}

// A shorter, chart-ready series for the stock detail page's price chart —
// separate from fetchPriceHistory's ~9-year fetch (used for historical P/E)
// so the chart stays fast and focused on recent price action.
export async function fetchChartSeries(ticker: string, range: "6mo" | "1y" | "5y" = "1y"): Promise<ChartPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`;
  const res = await fetch(url, { headers: { "User-Agent": YF_USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Yahoo Finance request failed (${res.status}) for ${ticker}`);
  }
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

  return timestamps
    .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), close: closes[i] }))
    .filter((p): p is ChartPoint => p.close != null);
}

// Closing price on (or just before) the given ISO date, e.g. a fiscal year-end.
export function closeNear(history: PriceHistory, isoDate: string): number {
  const target = new Date(`${isoDate}T00:00:00Z`).getTime() / 1000;
  let best = NaN;
  let bestDiff = Infinity;
  for (let i = 0; i < history.timestamps.length; i++) {
    const close = history.closes[i];
    const ts = history.timestamps[i];
    if (close == null || ts > target) continue;
    const diff = target - ts;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = close;
    }
  }
  return best;
}
