// Company overview text for the stock detail page. Fetched live (not baked
// into the batch refresh) since it rarely changes and only a handful of
// tickers get viewed per session.
const WIKIPEDIA_USER_AGENT = "buffett-screener research tool (contact: sihun7590@gmail.com)";

async function fetchSummary(lang: string, title: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { "User-Agent": WIKIPEDIA_USER_AGENT },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json.extract === "string" && json.extract.length > 0 ? json.extract : null;
  } catch {
    return null;
  }
}

// English Wikipedia article titles (data/universe.json) don't have a fixed
// mapping to their non-English counterparts, so we ask the English article
// for its interlanguage link instead of maintaining a manual title table.
async function fetchTranslatedTitle(enTitle: string, lang: string): Promise<string | null> {
  try {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("titles", enTitle);
    url.searchParams.set("prop", "langlinks");
    url.searchParams.set("lllang", lang);
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("origin", "*");
    const res = await fetch(url.toString(), { headers: { "User-Agent": WIKIPEDIA_USER_AGENT } });
    if (!res.ok) return null;
    const json = await res.json();
    const page = json?.query?.pages?.[0];
    const title = page?.langlinks?.[0]?.title;
    return typeof title === "string" && title.length > 0 ? title : null;
  } catch {
    return null;
  }
}

export async function fetchCompanySummary(wikiTitle: string, locale: string): Promise<string | null> {
  if (locale !== "en") {
    const translatedTitle = await fetchTranslatedTitle(wikiTitle, locale);
    if (translatedTitle) {
      const translated = await fetchSummary(locale, translatedTitle);
      if (translated) return translated;
    }
  }
  // Falls back to English when no article exists in the requested language
  // (common for smaller S&P 500 constituents).
  return fetchSummary("en", wikiTitle);
}
