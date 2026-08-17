// Recent news headlines for the stock detail page, via Yahoo Finance's
// unofficial search endpoint (same source lib/price.ts already uses).
// Fetched live per page view — news is inherently time-sensitive, so baking
// it into the daily batch refresh would make it stale within hours.
const YF_USER_AGENT = "Mozilla/5.0 (compatible; buffett-screener research tool)";
const MAX_AGE_DAYS = 30;
const MAX_ITEMS = 5;

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: string; // ISO date
}

interface YahooSearchNewsRaw {
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number; // unix seconds
}

export async function fetchRecentNews(ticker: string): Promise<NewsItem[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=10&quotesCount=0`;
    const res = await fetch(url, { headers: { "User-Agent": YF_USER_AGENT } });
    if (!res.ok) return [];
    const json = await res.json();
    const news: YahooSearchNewsRaw[] = json.news ?? [];
    const cutoff = Date.now() / 1000 - MAX_AGE_DAYS * 86_400;

    return news
      .filter((n) => n.providerPublishTime >= cutoff)
      .sort((a, b) => b.providerPublishTime - a.providerPublishTime)
      .slice(0, MAX_ITEMS)
      .map((n) => ({
        title: n.title,
        publisher: n.publisher,
        link: n.link,
        publishedAt: new Date(n.providerPublishTime * 1000).toISOString(),
      }));
  } catch {
    return [];
  }
}
