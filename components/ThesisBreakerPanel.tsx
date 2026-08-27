"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { METRIC_BY_ID, STRATEGY_METRICS, type Operator } from "@/lib/strategy";
import { DEFAULT_BREAKER_RULES, type BreakerRule, type TickerBreakers } from "@/lib/thesisBreakers";
import Panel from "./Panel";
import InfoTip from "./InfoTip";
import ConditionControls from "./ConditionControls";

export default function ThesisBreakerPanel({
  rules,
  fired,
  userId,
  watchedCount,
}: {
  rules: BreakerRule[];
  fired: TickerBreakers[];
  userId: string;
  watchedCount: number;
}) {
  const t = useTranslations("mypage.breakers");
  const tMetric = useTranslations("dashboard.strategy.metric");
  const tStrategy = useTranslations("dashboard.strategy");
  const locale = useLocale();
  const router = useRouter();

  const first = STRATEGY_METRICS[0];
  const [metric, setMetric] = useState(first.id);
  const [op, setOp] = useState<Operator>("lte");
  const [value, setValue] = useState(first.defaultValue);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const num = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v);

  const unitOf = (metricId: string) => {
    const m = METRIC_BY_ID.get(metricId);
    return m ? tStrategy(`unit.${m.unit}`) : "";
  };

  const ruleText = (r: BreakerRule) => `${tMetric(r.metric)} ${r.op === "gte" ? "≥" : "≤"} ${num(r.value)}${unitOf(r.metric)}`;

  const add = () => {
    if (!Number.isFinite(value)) return setError(t("errors.valueRequired"));
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: dbError } = await supabase.from("thesis_breakers").insert({ user_id: userId, metric, op, value });
      if (dbError) {
        // The unique constraint firing means this exact rule is already there,
        // which is worth saying plainly rather than showing a Postgres code.
        setError(dbError.code === "23505" ? t("errors.duplicate") : dbError.message);
        return;
      }
      router.refresh();
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("thesis_breakers").delete().eq("user_id", userId).eq("id", id);
      router.refresh();
    });
  };

  const loadDefaults = () => {
    startTransition(async () => {
      const supabase = createClient();
      // Ignores duplicates rather than failing the whole batch: someone who
      // already has two of the five should end up with all five.
      await supabase
        .from("thesis_breakers")
        .upsert(
          DEFAULT_BREAKER_RULES.map((r) => ({ user_id: userId, ...r })),
          { onConflict: "user_id,metric,op,value", ignoreDuplicates: true },
        );
      router.refresh();
    });
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip text={t("tip")} />
        </span>
      }
      trailing={
        <span className="text-[11px] text-ink-muted">
          {rules.length > 0 ? t("watching", { rules: rules.length, count: watchedCount }) : t("noRules")}
        </span>
      }
    >
      {/* What broke comes before the rules that define breaking. Someone opening
          this page wants the answer, not the configuration. */}
      {rules.length > 0 &&
        (fired.length === 0 ? (
          <p className="rounded-lg border border-up/40 bg-up/10 px-3 py-2.5 text-[12px] leading-relaxed text-up">
            {t("allClear", { count: watchedCount })}
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {fired.map((f) => (
              <li key={f.ticker} className="rounded-lg border border-down/40 bg-down/10 px-3.5 py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`/stock/${f.ticker}`}
                    className="font-mono text-[13px] font-bold text-ink hover:text-brand hover:underline"
                  >
                    {f.ticker}
                  </Link>
                  <span className="text-[11px] text-ink-muted">{f.companyName}</span>
                  <span className="ml-auto font-mono text-[11px] font-bold text-down">
                    {t("brokenCount", { count: f.report.fired.length })}
                  </span>
                </div>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {f.report.fired.map((b) => (
                    <li key={b.rule.id} className="text-[12px] leading-relaxed text-ink-muted">
                      <span className="text-down">✕</span> {tMetric(b.rule.metric)}{" "}
                      <span className="font-mono tabular-nums text-ink">
                        {num(b.actual)}
                        {unitOf(b.rule.metric)}
                      </span>{" "}
                      <span className="text-ink-faint">
                        ({t("ruleWas", { rule: ruleText(b.rule) })})
                      </span>
                    </li>
                  ))}
                </ul>
                {f.report.unmeasurable.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-warn">
                    {t("unmeasurable", { count: f.report.unmeasurable.length })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ))}

      <div className={rules.length > 0 ? "mt-4 border-t border-line pt-4" : ""}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">{t("rulesTitle")}</h4>
          {rules.length === 0 && (
            <button
              type="button"
              onClick={loadDefaults}
              disabled={pending}
              className="h-8 rounded-[10px] border border-line-strong bg-surface-2 px-3 text-[12px] font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
            >
              {t("loadDefaults")}
            </button>
          )}
        </div>

        {rules.length === 0 ? (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">{t("empty")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {rules.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-1 rounded-[9px] border border-line-strong bg-surface-2 pl-2.5 text-[11px] font-semibold text-ink-2"
              >
                <span className="py-1">{ruleText(r)}</span>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={pending}
                  aria-label={t("removeRule", { rule: ruleText(r) })}
                  className="px-1.5 py-1 text-ink-faint transition-colors hover:text-down disabled:opacity-50"
                >
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" d="M3 3l6 6M9 3l-6 6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint">{t("addPrefix")}</span>
          <ConditionControls
            metric={metric}
            op={op}
            value={value}
            onMetricChange={(next) => {
              setMetric(next);
              // A breaker is nearly always "this fell below X", so the default
              // comparison here is the mirror of the screen builder's.
              const m = METRIC_BY_ID.get(next);
              if (m) {
                setOp(m.defaultOp === "gte" ? "lte" : "gte");
                setValue(m.defaultValue);
              }
            }}
            onOpChange={setOp}
            onValueChange={setValue}
          />
          <button
            type="button"
            onClick={add}
            disabled={pending}
            className="h-9 rounded-[10px] border border-brand-border bg-brand-soft px-3 text-[12px] font-semibold text-brand-text-2 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {t("addRule")}
          </button>
        </div>
        {error && <p className="mt-2 text-[12px] text-down">{error}</p>}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{t("note")}</p>
      </div>
    </Panel>
  );
}
