// Trailing-twelve-month figures from SEC quarterly filings.
//
// Annual filings alone leave the scorer looking at numbers up to a year stale:
// between 10-Ks, everything except the share price sits still. TTM closes that
// gap without pretending a quarter is a year.
//
// The obvious approach — add up the last four quarters — needs Q4, which is
// never filed on its own (it's whatever the 10-K has left after the first
// three quarters). It also has to cope with filers that report only
// year-to-date figures and never a bare quarter. This instead uses the
// identity that avoids reconstructing quarters at all:
//
//     TTM = year-to-date now + last full year − year-to-date a year ago
//
// which needs three figures companies do reliably report.
import type { CompanyFacts } from "./xbrl";

export interface DurationFact {
  start: string;
  end: string;
  val: number;
  filed: string;
  months: number;
}

export interface InstantFact {
  end: string;
  val: number;
  filed: string;
}

const DAY = 86_400_000;
const monthsBetween = (start: string, end: string) =>
  Math.round(((new Date(end).getTime() - new Date(start).getTime()) / DAY / 365) * 12);

// Fiscal calendars drift a few days year to year, so periods are matched by
// approximate length and approximate anniversary rather than exact dates.
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

// Facts grouped by the concept they came from, freshest concept first.
//
// Taking the first tag in the priority list that has *any* data is a trap:
// companies migrate between concepts, and the abandoned one keeps its history,
// so the priority list can hand back figures years out of date while a newer
// concept holds the current ones. Ordering by how recent each concept's data
// is picks the one the company actually files under now — and callers still
// fall through to the next concept if the freshest can't produce an answer.
// Concepts are never mixed within one figure: a year-to-date from one and an
// annual from another need not mean the same thing.
function factsByConcept(
  facts: CompanyFacts,
  tags: string[],
  asOf: string | undefined,
  wantDuration: boolean,
): { tag: string; points: (DurationFact | InstantFact)[] }[] {
  const gaap = facts.facts?.["us-gaap"] ?? {};
  const groups: { tag: string; latestEnd: string; points: (DurationFact | InstantFact)[] }[] = [];

  for (const tag of tags) {
    const concept = gaap[tag];
    if (!concept?.units) continue;

    const collected: (DurationFact | InstantFact)[] = [];
    const seen = new Map<string, InstantFact>();

    for (const points of Object.values(concept.units)) {
      for (const pt of points) {
        if (pt.form !== "10-K" && pt.form !== "10-Q") continue;
        if (asOf && pt.filed > asOf) continue;
        if (wantDuration) {
          if (!pt.start) continue;
          collected.push({
            start: pt.start,
            end: pt.end,
            val: pt.val,
            filed: pt.filed,
            months: monthsBetween(pt.start, pt.end),
          });
        } else {
          if (pt.start) continue;
          // A balance-sheet date reappears as the comparative in later
          // filings; the most recently filed version is the one in force.
          const existing = seen.get(pt.end);
          if (!existing || pt.filed > existing.filed) seen.set(pt.end, { end: pt.end, val: pt.val, filed: pt.filed });
        }
      }
    }

    const points = wantDuration ? collected : [...seen.values()];
    if (points.length === 0) continue;
    const latestEnd = points.reduce((max, p) => (p.end > max ? p.end : max), "");
    groups.push({ tag, latestEnd, points });
  }

  return groups
    .sort((a, b) => b.latestEnd.localeCompare(a.latestEnd))
    .map(({ tag, points }) => ({ tag, points }));
}

export function durationFactsByConcept(facts: CompanyFacts, tags: string[], asOf?: string): DurationFact[][] {
  return factsByConcept(facts, tags, asOf, true).map((g) => g.points as DurationFact[]);
}

/** The most recent balance-sheet value on or before `asOf`. */
export function latestInstant(facts: CompanyFacts, tags: string[], asOf?: string): InstantFact | null {
  for (const group of factsByConcept(facts, tags, asOf, false)) {
    const usable = (group.points as InstantFact[])
      .filter((f) => !asOf || f.end <= asOf)
      .sort((a, b) => b.end.localeCompare(a.end));
    if (usable.length > 0) return usable[0];
  }
  return null;
}

export interface TtmResult {
  value: number;
  /** Period end the figure runs to. */
  end: string;
  /** True when it came straight from an annual filing with no quarters involved. */
  fromAnnual: boolean;
}

// Picks, among periods ending on the same date, the longest — which is the
// year-to-date figure, since a quarter's report also restates the shorter
// windows inside it.
function longestEndingAt(facts: DurationFact[], end: string): DurationFact | null {
  const candidates = facts.filter((f) => f.end === end);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, f) => (f.months > best.months ? f : best));
}

export function ttm(facts: CompanyFacts, tags: string[], asOf?: string): TtmResult | null {
  // Freshest concept first, falling through to older ones if the newest can't
  // supply the three figures the identity needs.
  for (const group of durationFactsByConcept(facts, tags, asOf)) {
    const result = ttmFromConcept(group, asOf);
    if (result) return result;
  }
  return null;
}

function ttmFromConcept(all: DurationFact[], asOf?: string): TtmResult | null {
  if (all.length === 0) return null;

  const cutoff = asOf ?? "9999-12-31";
  const ends = [...new Set(all.filter((f) => f.end <= cutoff).map((f) => f.end))].sort((a, b) => b.localeCompare(a));
  if (ends.length === 0) return null;

  const latest = longestEndingAt(all, ends[0]);
  if (!latest) return null;

  // Straight off a 10-K, with no quarter since: the annual figure already is
  // the trailing twelve months.
  if (near(latest.months, 12, 1)) {
    return { value: latest.val, end: latest.end, fromAnnual: true };
  }

  if (!near(latest.months, 3, 1) && !near(latest.months, 6, 1) && !near(latest.months, 9, 1)) return null;

  // The fiscal year this year-to-date period belongs to ended the day before
  // it started; allow a few days of drift in the fiscal calendar.
  const ytdStart = new Date(latest.start).getTime();
  const priorFy = all
    .filter((f) => near(f.months, 12, 1))
    .filter((f) => Math.abs(new Date(f.end).getTime() - (ytdStart - DAY)) <= 7 * DAY)
    .sort((a, b) => b.filed.localeCompare(a.filed))[0];
  if (!priorFy) return null;

  // The same stretch of the prior year, so subtracting it leaves exactly the
  // twelve months ending now.
  const target = new Date(latest.end).getTime() - 365 * DAY;
  const priorYtd = all
    .filter((f) => f.months === latest.months)
    .filter((f) => Math.abs(new Date(f.end).getTime() - target) <= 21 * DAY)
    .sort((a, b) => b.filed.localeCompare(a.filed))[0];
  if (!priorYtd) return null;

  return { value: latest.val + priorFy.val - priorYtd.val, end: latest.end, fromAnnual: false };
}
