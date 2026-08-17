// Company overview text for the stock detail page. Fetched live (not baked
// into the batch refresh) since it rarely changes and only a handful of
// tickers get viewed per session.
const WIKIPEDIA_USER_AGENT = "buffett-screener research tool (contact: sihun7590@gmail.com)";

export async function fetchCompanySummary(wikiTitle: string): Promise<string | null> {
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`, {
      headers: { "User-Agent": WIKIPEDIA_USER_AGENT },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json.extract === "string" && json.extract.length > 0 ? json.extract : null;
  } catch {
    return null;
  }
}
