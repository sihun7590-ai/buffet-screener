// Thin client for SEC EDGAR's XBRL "company facts" API — free, no API key,
// no daily quota (just a 10 req/sec fair-use limit). In exchange for that,
// the data is raw, per-concept XBRL facts (e.g. "us-gaap:NetIncomeLoss")
// instead of FMP's pre-shaped income/balance/cashflow statements, and
// companies don't always use the same tag for the same line item (taxonomy
// changes over the years, or across companies). annualSeries() below merges
// a priority-ordered list of candidate tags into one annual time series.
const SEC_USER_AGENT = "buffett-screener research tool (contact: sihun7590@gmail.com)";

async function secFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": SEC_USER_AGENT } });
  if (!res.ok) {
    throw new Error(`SEC EDGAR request failed (${res.status}) for ${url}`);
  }
  return res.json() as Promise<T>;
}

interface TickerCikRow {
  cik_str: number;
  ticker: string;
  title: string;
}

let tickerCikCache: Map<string, string> | null = null;

// SEC's ticker->CIK file sometimes points a ticker at a freshly registered
// entity with no filing history yet — typically right after a holding-company
// reorganization, while the real financial history still lives under the
// original (legacy) CIK. Override those cases here as they're discovered.
const CIK_OVERRIDES: Record<string, string> = {
  XOM: "0000034088", // "Exxon Mobil Corp" (legacy) — company_tickers.json now
  // maps XOM to a newly formed "ExxonMobil Holdings Corp" CIK with no 10-K data yet.
  AEP: "0000004904", // American Electric Power — missing from company_tickers.json
  // entirely (that file is a best-effort convenience index, not authoritative).
};

async function loadTickerCikMap(): Promise<Map<string, string>> {
  if (tickerCikCache) return tickerCikCache;
  const data = await secFetch<Record<string, TickerCikRow>>("https://www.sec.gov/files/company_tickers.json");
  const map = new Map<string, string>();
  for (const row of Object.values(data)) {
    map.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
  }
  for (const [ticker, cik] of Object.entries(CIK_OVERRIDES)) {
    map.set(ticker, cik);
  }
  tickerCikCache = map;
  return map;
}

export interface CompanyFacts {
  facts?: {
    "us-gaap"?: Record<string, { units: Record<string, XbrlFact[]> }>;
  };
}

interface XbrlFact {
  start?: string;
  end: string;
  val: number;
  fy: number;
  fp: string;
  form: string;
  filed: string;
}

export async function fetchCompanyFacts(ticker: string): Promise<CompanyFacts> {
  const map = await loadTickerCikMap();
  const cik = map.get(ticker.toUpperCase());
  if (!cik) {
    throw new Error(`SEC EDGAR: no CIK found for ticker ${ticker}`);
  }
  return secFetch<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
}

export interface FiscalPoint {
  end: string; // ISO date, fiscal period end
  val: number;
}

// Merges one or more candidate XBRL tags (in priority order) into a single
// annual series, deduped by period-end date. For duration facts (revenue,
// net income, ...) we keep only ~1-year periods to filter out the quarterly
// entries that show up alongside annual ones in the raw data.
export function annualSeries(facts: CompanyFacts, tags: string[], instant: boolean): FiscalPoint[] {
  const gaap = facts.facts?.["us-gaap"] ?? {};
  const byEnd = new Map<string, { val: number; filed: string; tag: string }>();

  for (const tag of tags) {
    const concept = gaap[tag];
    if (!concept?.units) continue;
    for (const points of Object.values(concept.units)) {
      for (const pt of points) {
        if (pt.form !== "10-K") continue;
        if (!instant) {
          if (!pt.start) continue;
          const days = (new Date(pt.end).getTime() - new Date(pt.start).getTime()) / 86_400_000;
          if (days < 340 || days > 380) continue; // skip quarters/half-years
        }
        const existing = byEnd.get(pt.end);
        if (!existing) {
          byEnd.set(pt.end, { val: pt.val, filed: pt.filed, tag });
        } else if (existing.tag === tag && pt.filed > existing.filed) {
          // same tag reported this period again in a later filing (as a
          // comparative year) — keep the most recently filed value
          byEnd.set(pt.end, { val: pt.val, filed: pt.filed, tag });
        }
        // a higher-priority tag already covers this period -> leave it
      }
    }
  }

  return [...byEnd.entries()]
    .map(([end, v]) => ({ end, val: v.val }))
    .sort((a, b) => b.end.localeCompare(a.end));
}

export function lookupByEnd(series: FiscalPoint[], end: string): number {
  return series.find((p) => p.end === end)?.val ?? NaN;
}
