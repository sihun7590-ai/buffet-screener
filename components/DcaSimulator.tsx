"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { runDcaSimulation, type DcaFrequency, type PricePoint } from "@/lib/dca";
import Panel from "./Panel";
import InfoTip from "./InfoTip";
import DcaChart from "./DcaChart";

const WEEKDAYS = [1, 2, 3, 4, 5] as const; // Mon-Fri; the market's shut the other two anyway

export default function DcaSimulator({ prices, currentPrice }: { prices: PricePoint[]; currentPrice: number }) {
  const t = useTranslations("dca");
  const locale = useLocale();

  const firstAvailable = prices[0]?.date;
  const lastAvailable = prices[prices.length - 1]?.date;

  const [amount, setAmount] = useState(100);
  const [frequency, setFrequency] = useState<DcaFrequency>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startDate, setStartDate] = useState(firstAvailable ?? "");

  const result = useMemo(
    () =>
      runDcaSimulation(prices, currentPrice, {
        amount,
        frequency,
        dayOfMonth,
        dayOfWeek,
        startDate: startDate || firstAvailable || "",
      }),
    [prices, currentPrice, amount, frequency, dayOfMonth, dayOfWeek, startDate, firstAvailable],
  );

  const usdFmt = (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v);
  const pctFmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(v);
  const shareFmt = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(v);

  if (!firstAvailable || !lastAvailable) return null;

  const returnColor = result.totalReturn >= 0 ? "var(--up)" : "var(--down)";

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip text={t("tip")} />
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-ink-muted">{t("form.amount")}</span>
            <div className="flex items-center gap-2">
              <span className="text-ink-faint">$</span>
              <input
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 0))}
                className="h-9 w-full rounded-md border border-line bg-subtle px-2.5 font-mono text-ink tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-ink-muted">{t("form.frequency")}</span>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as DcaFrequency)}
              className="h-9 rounded-md border border-line bg-subtle px-2.5 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="daily">{t("form.freqDaily")}</option>
              <option value="weekly">{t("form.freqWeekly")}</option>
              <option value="monthly">{t("form.freqMonthly")}</option>
            </select>
          </label>

          {frequency === "monthly" && (
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-ink-muted">{t("form.dayOfMonth")}</span>
              <select
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="h-9 rounded-md border border-line bg-subtle px-2.5 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {t("form.dayOfMonthValue", { day: d })}
                  </option>
                ))}
              </select>
            </label>
          )}

          {frequency === "weekly" && (
            <label className="flex flex-col gap-1 text-[13px]">
              <span className="text-ink-muted">{t("form.dayOfWeek")}</span>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="h-9 rounded-md border border-line bg-subtle px-2.5 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {t(`form.weekday.${d}`)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-ink-muted">{t("form.startDate")}</span>
            <input
              type="date"
              min={firstAvailable}
              max={lastAvailable}
              value={startDate || firstAvailable}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 rounded-md border border-line bg-subtle px-2.5 font-mono text-ink tabular-nums focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </label>

          <p className="text-[11px] leading-relaxed text-ink-faint">{t("form.note")}</p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-line bg-subtle px-3 py-2.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                {t("stats.invested")}
              </div>
              <div className="mt-1 font-mono text-[15px] font-bold tabular-nums text-ink">
                {usdFmt(result.totalInvested)}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-subtle px-3 py-2.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                {t("stats.value")}
              </div>
              <div className="mt-1 font-mono text-[15px] font-bold tabular-nums text-ink">
                {usdFmt(result.currentValue)}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-subtle px-3 py-2.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                {t("stats.return")}
                <InfoTip text={t("stats.returnTip")} />
              </div>
              <div className="mt-1 font-mono text-[15px] font-bold tabular-nums" style={{ color: returnColor }}>
                {pctFmt(result.totalReturn)}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-subtle px-3 py-2.5">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                {t("stats.purchases")}
              </div>
              <div className="mt-1 font-mono text-[15px] font-bold tabular-nums text-ink">
                {result.purchases.length}
              </div>
            </div>
          </div>

          {result.purchases.length > 0 ? (
            <>
              <DcaChart curve={result.equityCurve} />
              <p className="text-[11px] text-ink-faint">
                {t("stats.sharesNote", { shares: shareFmt(result.totalShares) })}
              </p>
            </>
          ) : (
            <p className="rounded-lg border border-line bg-subtle px-3 py-6 text-center text-[12px] text-ink-faint">
              {t("emptyState")}
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
