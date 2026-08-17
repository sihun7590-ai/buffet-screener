// Builds the localized "actual value" string for a scoring criterion from
// its raw `values` (see CriterionResult in lib/types.ts). Label/threshold/
// explanation are plain per-criterion strings in messages/{locale}.json —
// only this "value" line is assembled from numbers, since it's the one part
// that's genuinely data-dependent.
import type { CriterionResult } from "./types";

type NAWord = "notAvailable";

function pct(v: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
}

function num(v: number, locale: string, digits = 2): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

function usd(v: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

export function formatCriterionValue(c: Pick<CriterionResult, "id" | "values">, locale: string, t: (key: NAWord) => string): string {
  const v = c.values;
  const na = t("notAvailable");

  switch (c.id) {
    case "roe":
      return Number.isFinite(v.roeAvg) ? pct(v.roeAvg, locale) : na;
    case "roic":
      return Number.isFinite(v.roicAvg) ? pct(v.roicAvg, locale) : na;
    case "grossMargin":
      return Number.isFinite(v.marginAvg) ? `${pct(v.marginAvg, locale)} (±${pct(v.stabilityPenalty, locale)})` : na;
    case "debt":
      return `D/E ${Number.isFinite(v.debtEquity) ? num(v.debtEquity, locale) : na}, ${
        Number.isFinite(v.interestCoverage) ? `${num(v.interestCoverage, locale, 1)}x` : na
      }`;
    case "epsConsistency":
      return `${v.lossYears} · ${pct(v.epsCagr, locale)}`;
    case "fcf":
      return `${v.fcfPositiveYears}/${v.totalYears} · ${pct(v.fcfMargin, locale)}`;
    case "shareCount":
      return pct(v.shareCountDelta, locale);
    case "currentRatio":
      return Number.isFinite(v.currentRatio) ? num(v.currentRatio, locale) : na;
    case "peRelative":
      return `${Number.isFinite(v.currentPe) ? num(v.currentPe, locale, 1) : na} / ${
        Number.isFinite(v.peOwnAvg) ? num(v.peOwnAvg, locale, 1) : na
      } / ${num(v.sectorPe, locale, 1)}`;
    case "peg":
      return Number.isFinite(v.peg) ? num(v.peg, locale) : na;
    case "grahamNumber":
      return Number.isFinite(v.grahamNumber) ? `${usd(v.price, locale)} / ${usd(v.grahamNumber, locale)}` : na;
    case "marginOfSafety":
      return Number.isFinite(v.intrinsicValuePerShare)
        ? `${usd(v.intrinsicValuePerShare, locale)} / ${usd(v.currentPrice, locale)} → ${pct(v.marginOfSafety, locale)}`
        : na;
    default:
      return na;
  }
}
