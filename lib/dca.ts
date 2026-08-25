// Simulates buying a fixed dollar amount of one stock on a repeating
// schedule (daily / weekly / monthly) and reports what that would be worth
// today. Pure function — no fetching — so it can be unit-tested and re-run
// on every input change in the browser without a round trip; only the price
// history itself comes from the network (lib/price.ts, fetched once per page
// visit in app/[locale]/stock/[ticker]/page.tsx).
export type DcaFrequency = "daily" | "weekly" | "monthly";

export interface DcaConfig {
  /** USD spent on each scheduled purchase. */
  amount: number;
  frequency: DcaFrequency;
  /** 1-28 for monthly (capped so every month has that day). */
  dayOfMonth: number;
  /** 0 (Sunday) - 6 (Saturday) for weekly. */
  dayOfWeek: number;
  /** ISO date; purchases before the first available price are skipped anyway. */
  startDate: string;
}

export interface PricePoint {
  date: string; // ISO, ascending, one per trading day
  close: number;
}

export interface DcaPurchase {
  date: string;
  price: number;
  shares: number;
}

export interface DcaResult {
  purchases: DcaPurchase[];
  totalInvested: number;
  totalShares: number;
  currentValue: number;
  currentPrice: number;
  totalReturn: number; // decimal, e.g. 0.32 = +32%
  /** Cumulative invested vs. cumulative value at each purchase, for charting. */
  equityCurve: { date: string; invested: number; value: number }[];
}

function emptyResult(currentPrice: number): DcaResult {
  return { purchases: [], totalInvested: 0, totalShares: 0, currentValue: 0, currentPrice, totalReturn: 0, equityCurve: [] };
}

// Every scheduled date from startDate through endDate (inclusive), in the
// given cadence. Dates are plain ISO strings compared lexicographically,
// which sorts identically to chronological order.
function scheduledDates(config: DcaConfig, startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const end = new Date(`${endDate}T00:00:00Z`);
  const start = new Date(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return dates;

  if (config.frequency === "monthly") {
    // Up to 31 is allowed, but not every month has one — clamp to that
    // month's actual last day (so "31일" buys on Feb 28/29, Apr/Jun/Sep/Nov
    // 30) rather than letting Date's own month-overflow silently roll into
    // the *next* month, which is what naively calling setUTCMonth on a Date
    // already sitting on day 31 would do.
    const day = Math.min(Math.max(Math.round(config.dayOfMonth), 1), 31);
    const dateForMonth = (monthsFromStart: number) => {
      const month = start.getUTCMonth() + monthsFromStart;
      const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), month + 1, 0)).getUTCDate();
      return new Date(Date.UTC(start.getUTCFullYear(), month, Math.min(day, daysInMonth)));
    };
    let offset = 0;
    if (dateForMonth(0) < start) offset = 1;
    for (let d = dateForMonth(offset); d <= end; d = dateForMonth(++offset)) {
      dates.push(d.toISOString().slice(0, 10));
    }
  } else if (config.frequency === "weekly") {
    const dow = Math.min(Math.max(Math.round(config.dayOfWeek), 0), 6);
    const d = new Date(start);
    while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1);
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 7);
    }
  } else {
    const d = new Date(start);
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return dates;
}

/**
 * Buys `config.amount` worth of stock on every scheduled date, at that day's
 * close — or the next trading day's close if the market was shut (weekend,
 * holiday). Both `prices` and the generated schedule are ascending, so a
 * single forward-moving pointer finds every match in one pass without
 * rescanning the price history per scheduled date.
 */
export function runDcaSimulation(prices: PricePoint[], currentPrice: number, config: DcaConfig): DcaResult {
  if (prices.length === 0 || !(config.amount > 0)) return emptyResult(currentPrice);

  const firstAvailable = prices[0].date;
  const lastAvailable = prices[prices.length - 1].date;
  const startDate = config.startDate > firstAvailable ? config.startDate : firstAvailable;
  if (startDate > lastAvailable) return emptyResult(currentPrice);

  const dates = scheduledDates(config, startDate, lastAvailable);

  const purchases: DcaPurchase[] = [];
  let idx = 0;
  let lastBoughtDate: string | null = null;
  for (const scheduled of dates) {
    while (idx < prices.length && prices[idx].date < scheduled) idx++;
    if (idx >= prices.length) break;
    const hit = prices[idx];
    // A holiday can push two nearby scheduled dates onto the same next
    // trading day (e.g. a weekly cadence around a market closure) — buy once.
    if (hit.date === lastBoughtDate) continue;
    lastBoughtDate = hit.date;
    purchases.push({ date: hit.date, price: hit.close, shares: config.amount / hit.close });
  }

  const totalInvested = purchases.length * config.amount;
  const totalShares = purchases.reduce((sum, p) => sum + p.shares, 0);
  const currentValue = totalShares * currentPrice;
  const totalReturn = totalInvested > 0 ? currentValue / totalInvested - 1 : 0;

  let cumShares = 0;
  let cumInvested = 0;
  const equityCurve = purchases.map((p) => {
    cumShares += p.shares;
    cumInvested += config.amount;
    return { date: p.date, invested: cumInvested, value: cumShares * p.price };
  });

  return {
    purchases,
    totalInvested,
    totalShares,
    currentValue,
    currentPrice,
    totalReturn: Number.isFinite(totalReturn) ? totalReturn : 0,
    equityCurve,
  };
}
