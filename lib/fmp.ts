import type {
  FmpBalanceSheet,
  FmpCashFlow,
  FmpIncomeStatement,
  FmpKeyMetrics,
  FmpProfile,
  FmpQuote,
  FmpRatios,
  TickerFinancials,
} from "./types";

const BASE_URL = "https://financialmodelingprep.com/api/v3";

// FMP's free tier is rate-limited (a few hundred requests/day). We space
// requests out and retry once on 429 instead of hammering the API.
const REQUEST_DELAY_MS = 350;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fmpGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    throw new Error("FMP_API_KEY is not set. Add it to .env.local (see .env.local.example).");
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("apikey", apiKey);

  await sleep(REQUEST_DELAY_MS);

  const res = await fetch(url.toString());

  if (res.status === 429) {
    // one retry after a longer backoff, free tier hits this often in bursts
    await sleep(3000);
    const retry = await fetch(url.toString());
    if (!retry.ok) {
      throw new Error(`FMP request failed (${retry.status}) for ${path}`);
    }
    return retry.json() as Promise<T>;
  }

  if (!res.ok) {
    throw new Error(`FMP request failed (${res.status}) for ${path}`);
  }

  return res.json() as Promise<T>;
}

const YEARS = 10;

export async function fetchTickerFinancials(ticker: string): Promise<TickerFinancials> {
  const [profileArr, quoteArr, income, balance, cashFlow, ratios, keyMetrics] = await Promise.all([
    fmpGet<FmpProfile[]>(`/profile/${ticker}`),
    fmpGet<FmpQuote[]>(`/quote/${ticker}`),
    fmpGet<FmpIncomeStatement[]>(`/income-statement/${ticker}`, { period: "annual", limit: YEARS }),
    fmpGet<FmpBalanceSheet[]>(`/balance-sheet-statement/${ticker}`, { period: "annual", limit: YEARS }),
    fmpGet<FmpCashFlow[]>(`/cash-flow-statement/${ticker}`, { period: "annual", limit: YEARS }),
    fmpGet<FmpRatios[]>(`/ratios/${ticker}`, { period: "annual", limit: YEARS }),
    fmpGet<FmpKeyMetrics[]>(`/key-metrics/${ticker}`, { period: "annual", limit: YEARS }),
  ]);

  const profile = profileArr[0];
  const quote = quoteArr[0];

  if (!profile || !quote) {
    throw new Error(`No profile/quote data returned for ${ticker}`);
  }

  return { ticker, profile, quote, income, balance, cashFlow, ratios, keyMetrics };
}
