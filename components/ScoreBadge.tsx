function colorFor(score: number, max: number) {
  const ratio = score / max;
  if (ratio >= 0.7) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (ratio >= 0.5) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
}

export default function ScoreBadge({ score, max = 100 }: { score: number; max?: number }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${colorFor(score, max)}`}>
      {score.toFixed(1)}
      <span className="ml-0.5 font-normal opacity-60">/{max}</span>
    </span>
  );
}
