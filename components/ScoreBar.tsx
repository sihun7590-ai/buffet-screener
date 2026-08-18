// Scores are the primary scannable column in the table, so they get a number
// plus a proportional bar — reading a column of bars is far faster than
// reading a column of digits.
export function scoreColor(score: number, max: number): string {
  const ratio = score / max;
  if (ratio >= 0.7) return "var(--up)";
  if (ratio >= 0.5) return "var(--warn)";
  return "var(--down)";
}

export default function ScoreBar({
  score,
  max,
  strong = false,
}: {
  score: number;
  max: number;
  strong?: boolean;
}) {
  if (!Number.isFinite(score)) {
    return <span className="font-mono text-xs text-ink-faint">N/A</span>;
  }

  const pct = Math.max(0, Math.min(1, score / max)) * 100;
  const color = scoreColor(score, max);

  return (
    <div className="flex items-center gap-2">
      <span
        className={`font-mono tabular-nums ${strong ? "text-sm font-bold" : "text-[13px] font-semibold"}`}
        style={{ color }}
      >
        {score.toFixed(1)}
      </span>
      <span className={`overflow-hidden rounded-full bg-line ${strong ? "h-1.5 w-16" : "h-1 w-12"}`}>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </span>
    </div>
  );
}
