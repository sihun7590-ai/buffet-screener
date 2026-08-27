"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_ALERT_SETTINGS, type AlertSettings } from "@/lib/alerts";
import Panel from "./Panel";
import InfoTip from "./InfoTip";

type FieldId = "totalThreshold" | "axisThreshold" | "priceDropThreshold" | "lookbackDays";

// Percent-shaped in the database, percent-shaped on screen. The price threshold
// is the only one stored as a decimal, so it converts at the edge rather than
// leaving 0.25 in a box labelled "%".
const FIELDS: { id: FieldId; step: number; min: number; max: number; scale: number }[] = [
  { id: "totalThreshold", step: 1, min: 1, max: 100, scale: 1 },
  { id: "axisThreshold", step: 1, min: 1, max: 100, scale: 1 },
  { id: "priceDropThreshold", step: 1, min: 1, max: 99, scale: 100 },
  { id: "lookbackDays", step: 1, min: 1, max: 3650, scale: 1 },
];

export default function AlertSettingsPanel({ settings, userId }: { settings: AlertSettings; userId: string }) {
  const t = useTranslations("mypage.alertSettings");
  const router = useRouter();

  const [draft, setDraft] = useState<AlertSettings>(settings);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isDefault = FIELDS.every((f) => draft[f.id] === DEFAULT_ALERT_SETTINGS[f.id]);

  const save = (next: AlertSettings) => {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: dbError } = await supabase.from("alert_settings").upsert(
        {
          user_id: userId,
          total_threshold: next.totalThreshold,
          axis_threshold: next.axisThreshold,
          price_drop_threshold: next.priceDropThreshold,
          lookback_days: Math.round(next.lookbackDays),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (dbError) {
        setError(dbError.message);
        return;
      }
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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="h-8 rounded-[10px] border border-line-strong bg-surface-2 px-3 text-[12px] font-semibold text-ink-2 transition-colors hover:text-ink"
        >
          {open ? t("close") : t("adjust")}
        </button>
      }
    >
      {!open ? (
        <p className="text-[12px] leading-relaxed text-ink-muted">
          {t("current", {
            total: draft.totalThreshold,
            axis: draft.axisThreshold,
            price: Math.round(draft.priceDropThreshold * 100),
            days: draft.lookbackDays,
          })}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {FIELDS.map((f) => (
              <label key={f.id} className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint">
                  {t(`fields.${f.id}.label`)}
                  <InfoTip text={t(`fields.${f.id}.tip`)} />
                </span>
                <span className="flex h-9 items-center rounded-[10px] border border-line-strong bg-surface-3 pr-2.5">
                  <input
                    type="number"
                    step={f.step}
                    min={f.min}
                    max={f.max}
                    value={Math.round(draft[f.id] * f.scale * 100) / 100}
                    onChange={(e) => {
                      const shown = Number(e.target.value);
                      setDraft((d) => ({ ...d, [f.id]: Number.isFinite(shown) ? shown / f.scale : d[f.id] }));
                    }}
                    className="h-full w-full bg-transparent px-2.5 text-right font-mono text-[13px] tabular-nums text-ink outline-none"
                  />
                  <span className="shrink-0 font-mono text-[11px] text-ink-faint">{t(`fields.${f.id}.unit`)}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save(draft)}
              disabled={pending}
              className="h-9 rounded-[10px] bg-brand px-4 text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t("save")}
            </button>
            {!isDefault && (
              <button
                type="button"
                onClick={() => {
                  setDraft(DEFAULT_ALERT_SETTINGS);
                  save(DEFAULT_ALERT_SETTINGS);
                }}
                disabled={pending}
                className="h-9 px-1 text-[12px] font-medium text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline disabled:opacity-50"
              >
                {t("reset")}
              </button>
            )}
          </div>
          {error && <p className="mt-2 text-[12px] text-down">{error}</p>}
          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{t("note")}</p>
        </>
      )}
    </Panel>
  );
}
