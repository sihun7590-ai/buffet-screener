import type { ChartPoint } from "@/lib/price";

const WIDTH = 600;
const HEIGHT = 160;
const PAD_Y = 8;

export default function PriceChart({ points }: { points: ChartPoint[] }) {
  if (points.length < 2) {
    return <div className="text-sm text-zinc-400">차트 데이터를 가져올 수 없습니다.</div>;
  }

  const closes = points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const up = closes[closes.length - 1] >= closes[0];
  const colorClass = up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

  const toXY = (i: number, close: number) => {
    const x = (i / (points.length - 1)) * WIDTH;
    const y = PAD_Y + (1 - (close - min) / range) * (HEIGHT - PAD_Y * 2);
    return [x, y];
  };

  const linePath = points.map((p, i) => toXY(i, p.close)).map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX] = toXY(points.length - 1, closes[closes.length - 1]);
  const areaPath = `${linePath} L${lastX.toFixed(1)},${HEIGHT} L0,${HEIGHT} Z`;

  return (
    <div className={colorClass}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" preserveAspectRatio="none" role="img" aria-label="주가 차트">
        <path d={areaPath} fill="currentColor" opacity={0.08} stroke="none" />
        <path d={linePath} fill="none" stroke="currentColor" strokeWidth={1.75} />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-zinc-400">
        <span>{points[0].date}</span>
        <span>
          최저 ${min.toFixed(2)} · 최고 ${max.toFixed(2)}
        </span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}
