import { scoreColor } from "./ScoreBar";

// Radial gauge for the stock detail hero — the one number a visitor reads first.
export default function ScoreGauge({
  score,
  max = 100,
  size = 128,
  label,
}: {
  score: number;
  max?: number;
  size?: number;
  label?: string;
}) {
  const finite = Number.isFinite(score);
  const ratio = finite ? Math.max(0, Math.min(1, score / max)) : 0;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = finite ? scoreColor(score, max) : "var(--ink-faint)";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[26px] font-bold leading-none tabular-nums" style={{ color }}>
          {finite ? score.toFixed(1) : "N/A"}
        </span>
        <span className="mt-1 font-mono text-[11px] text-ink-faint tabular-nums">/ {max}</span>
        {label && (
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
