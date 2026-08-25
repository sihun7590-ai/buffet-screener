// Insider (Form 4) transactions for the stock detail page — officers,
// directors and 10%+ owners are legally required to report within two
// business days whenever they trade their own company's stock, and SEC EDGAR
// publishes those filings for free with no API key. Fetched live per page
// view, same as lib/news.ts and lib/wikipedia.ts and for the same reason:
// this is exactly the kind of thing that goes stale fast, and only a handful
// of tickers get viewed per session, so there's no batching win worth the
// staleness.
//
// Reuses lib/xbrl.ts's loadTickerCikMap() for ticker -> CIK (that file
// already carries override logic for tickers whose current CIK has no filing
// history — no point maintaining a second copy that can drift). secFetch
// itself isn't exported from lib/xbrl.ts, so this module has its own tiny
// fetch helpers below; they're a few lines, not worth threading through a
// shared export.
//
// New dependency: fast-xml-parser. Form 4 is legal filing XML — attribute
// order, whitespace and self-closing tags all vary across filers and across
// years — and this data shows real transaction amounts, so regex extraction
// is a correctness risk this module isn't willing to take. fast-xml-parser is
// small, has zero dependencies of its own, and is MIT licensed. This is the
// 7th runtime dependency in a project that has deliberately kept that number
// small; see README.md's "인사이더 매매 (Form 4)" section for the full
// reasoning.
//
// Scope limit: only nonDerivativeTransaction entries (plain share purchases,
// sales, gifts, tax-withholding, ...) are surfaced. derivativeTable /
// derivativeTransaction (option grants, RSU vesting, and their exercise) is
// deliberately skipped — that's a noisier signal dominated by scheduled
// compensation events rather than a discretionary decision to buy or sell,
// and mixing the two into one table would bury the transactions people
// actually come here to see.
import { loadTickerCikMap } from "./xbrl";
import { XMLParser } from "fast-xml-parser";

const SEC_USER_AGENT = "buffett-screener research tool (contact: sihun7590@gmail.com)"; // required by SEC — always identify yourself
const MAX_FILINGS = 5;
// How deep to look for those 5. Only filings where this company is the issuer
// count, and that can't be told apart without fetching each one.
const MAX_FILING_CANDIDATES = 12;
const REQUEST_DELAY_MS = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function secFetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": SEC_USER_AGENT } });
  if (!res.ok) throw new Error(`SEC EDGAR request failed (${res.status}) for ${url}`);
  return res.json() as Promise<T>;
}

async function secFetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": SEC_USER_AGENT } });
  if (!res.ok) throw new Error(`SEC EDGAR request failed (${res.status}) for ${url}`);
  return res.text();
}

// filings.recent is a set of parallel arrays (form[i], filingDate[i],
// accessionNumber[i], ... all describe the same filing at index i) rather
// than an array of filing objects — has to be zipped by hand.
interface SecSubmissions {
  filings?: {
    recent?: {
      form: string[];
      filingDate: string[];
      accessionNumber: string[];
      primaryDocument: string[];
    };
  };
}

// fast-xml-parser auto-converts "true"/"false" to real booleans and "1"/"0"
// to numbers, but which one a given filer's XML uses varies (compare Apple's
// literal "true" against JPMorgan's "1"), and an absent tag comes through as
// undefined rather than false. Plain `if (value)` happens to work for all
// three shapes here, but that's incidental to the parser's own coercion, not
// something to depend on — hence this explicit helper.
type XmlBoolish = boolean | number | string | undefined;
function truthy(v: XmlBoolish): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v === "true" || v === "1";
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// The classic fast-xml-parser footgun: an element that appears exactly once
// in the XML parses to a plain object; the same element appearing more than
// once (a Form 4 covering several trades, or a jointly-filed one with several
// reporting owners) parses to an array. Every place this module reads a
// repeatable element goes through here first so the rest of the code only
// ever deals with arrays.
function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

interface RawOwnerNode {
  reportingOwnerId?: { rptOwnerName?: string };
  reportingOwnerRelationship?: {
    isDirector?: XmlBoolish;
    isOfficer?: XmlBoolish;
    isTenPercentOwner?: XmlBoolish;
    officerTitle?: string;
  };
}

interface RawNonDerivativeTransaction {
  transactionDate?: { value?: string };
  transactionCoding?: { transactionCode?: string };
  transactionAmounts?: {
    transactionShares?: { value?: number | string };
    transactionPricePerShare?: { value?: number | string };
    transactionAcquiredDisposedCode?: { value?: string };
  };
  postTransactionAmounts?: {
    sharesOwnedFollowingTransaction?: { value?: number | string };
  };
}

interface RawForm4 {
  ownershipDocument?: {
    issuer?: { issuerCik?: string | number; issuerTradingSymbol?: string };
    reportingOwner?: RawOwnerNode | RawOwnerNode[];
    nonDerivativeTable?: {
      nonDerivativeTransaction?: RawNonDerivativeTransaction | RawNonDerivativeTransaction[];
    };
  };
}

export interface InsiderTransaction {
  insiderName: string;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  officerTitle: string | null;
  transactionDate: string; // ISO date (YYYY-MM-DD)
  transactionCode: string; // raw Form 4 code: P, S, A, F, M, G, ...
  direction: "A" | "D"; // acquired / disposed — the reliable buy/sell signal
  shares: number;
  pricePerShare: number | null; // null for grants, gifts, and other non-market transactions
  totalValue: number | null; // shares * price, only when price is known and > 0
  sharesOwnedAfter: number | null;
  filingUrl: string; // links back to the primary source, per this project's convention
}

const parser = new XMLParser();

export async function fetchInsiderTransactions(ticker: string): Promise<InsiderTransaction[]> {
  try {
    const cikMap = await loadTickerCikMap();
    const cik = cikMap.get(ticker.toUpperCase());
    if (!cik) return [];

    const submissions = await secFetchJson<SecSubmissions>(`https://data.sec.gov/submissions/CIK${cik}.json`);
    const recent = submissions.filings?.recent;
    if (!recent) return [];

    const form4Filings = recent.form
      .map((form, i) => ({ form, i }))
      .filter((f) => f.form === "4")
      .map((f) => ({
        filingDate: recent.filingDate[f.i],
        accessionNumber: recent.accessionNumber[f.i],
        primaryDocument: recent.primaryDocument[f.i],
      }))
      .sort((a, b) => b.filingDate.localeCompare(a.filingDate))
      // Whether a filing is about *this* company's stock is only knowable
      // after fetching and parsing it (see the issuer check below), so the
      // candidate list runs deeper than the number actually wanted. For most
      // companies every candidate qualifies and the loop stops at MAX_FILINGS
      // having fetched exactly that many; the extra depth only costs requests
      // for big cross-holders like Berkshire, whose most recent Form 4s are
      // largely about other companies' stock.
      .slice(0, MAX_FILING_CANDIDATES);

    const cikInt = String(parseInt(cik, 10)); // Archives paths use the CIK without zero-padding
    const transactions: InsiderTransaction[] = [];
    let matched = 0;

    for (const filing of form4Filings) {
      if (matched >= MAX_FILINGS) break;
      await sleep(REQUEST_DELAY_MS);

      const accNoDash = filing.accessionNumber.replace(/-/g, "");
      // filings.recent's primaryDocument (e.g. "xslF345X06/form4.xml") points
      // at the SEC's XSLT-rendered *human readable* view — which, despite the
      // ".xml" name, is served as actual HTML, not the machine-readable XML
      // this module needs to parse. The real XML always sits at the
      // accession folder's root under its own bare filename (verified across
      // several filers: AAPL's is "form4.xml", JPM's is "doc4.xml", XOM's a
      // third name entirely) — so only the last path segment is usable here.
      const rawXmlName = filing.primaryDocument.split("/").pop();
      if (!rawXmlName) continue;
      const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}/${rawXmlName}`;
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDash}/${filing.accessionNumber}-index.htm`;

      let xml: string;
      try {
        xml = await secFetchText(xmlUrl);
      } catch {
        continue; // one bad filing shouldn't drop the rest of this ticker's history
      }

      let parsed: RawForm4;
      try {
        parsed = parser.parse(xml) as RawForm4;
      } catch {
        continue;
      }

      const doc = parsed.ownershipDocument;
      if (!doc) continue;

      // A company's submissions feed returns Form 4s where it is *either* the
      // issuer whose stock was traded or the reporting owner doing the
      // trading. Large holders file plenty of the latter: Exxon is a 10%
      // owner of ProPetro, so Exxon's feed carries Form 4s about ProPetro
      // stock, and those were being shown on Exxon's page — another company's
      // insider selling, at another company's share price ($16.66 against
      // Exxon's ~$155), under Exxon's name. Only filings where this company is
      // the issuer describe this company's stock.
      const issuerCik = doc.issuer?.issuerCik;
      if (issuerCik === undefined || parseInt(String(issuerCik), 10) !== parseInt(cik, 10)) continue;
      matched++;

      // Joint filings (a handful of insiders reporting on one combined Form
      // 4) carry several reportingOwner entries; the common case is exactly
      // one. Taking the first keeps this simple — a filing that lists, say,
      // an executive and a trust they control attributes every row on it to
      // whichever owner XML lists first.
      const owner = toArray(doc.reportingOwner)[0];
      const insiderName = owner?.reportingOwnerId?.rptOwnerName?.trim() ?? "";
      const rel = owner?.reportingOwnerRelationship;
      const isDirector = truthy(rel?.isDirector);
      const isOfficer = truthy(rel?.isOfficer);
      const isTenPercentOwner = truthy(rel?.isTenPercentOwner);
      const officerTitle = isOfficer && rel?.officerTitle ? rel.officerTitle.trim() || null : null;

      for (const tx of toArray(doc.nonDerivativeTable?.nonDerivativeTransaction)) {
        const shares = num(tx.transactionAmounts?.transactionShares?.value);
        if (shares === null) continue; // nothing to show without a share count

        const adCode = tx.transactionAmounts?.transactionAcquiredDisposedCode?.value;
        if (adCode !== "A" && adCode !== "D") continue; // no reliable direction signal — skip rather than guess

        const price = num(tx.transactionAmounts?.transactionPricePerShare?.value);
        const pricePerShare = price !== null && price > 0 ? price : null;

        transactions.push({
          insiderName,
          isDirector,
          isOfficer,
          isTenPercentOwner,
          officerTitle,
          transactionDate: tx.transactionDate?.value ?? filing.filingDate,
          transactionCode: tx.transactionCoding?.transactionCode ?? "",
          direction: adCode,
          shares,
          pricePerShare,
          totalValue: pricePerShare !== null ? shares * pricePerShare : null,
          sharesOwnedAfter: num(tx.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value),
          filingUrl,
        });
      }
    }

    return transactions.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  } catch {
    return [];
  }
}
