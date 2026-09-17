import { useTranslations } from "next-intl";
import { requiredTier, type Feature } from "@/lib/entitlements";

function LockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="4.5" y="9" width="11" height="8" rx="2" />
      <path strokeLinecap="round" d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}

/**
 * What a locked feature shows in its place.
 *
 * There is no upgrade button, and that is a decision rather than an omission:
 * no checkout exists yet, and a button that looks like it sells something and
 * does nothing is exactly the kind of control this site has been removing. The
 * card says what the feature is and which plan has it. When payments are wired
 * up, the call to action goes here and only here.
 *
 * Not async and not marked "use client", so it renders from both the server
 * pages and the client dashboard.
 */
export default function LockedFeature({
  feature,
  variant = "panel",
}: {
  feature: Feature;
  /** "panel" replaces a whole section; "inline" replaces a single value or button. */
  variant?: "panel" | "inline";
}) {
  const t = useTranslations("paywall");
  const tier = requiredTier(feature);
  const plan = t(`tier.${tier}`);

  if (variant === "inline") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-[6px] border border-brand-border bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand-text-2"
        title={t("inlineTitle", { plan })}
      >
        <LockIcon className="h-2.5 w-2.5" />
        {plan}
      </span>
    );
  }

  return (
    <section className="flex flex-col items-start gap-2 rounded-[20px] border border-dashed border-brand-border bg-surface p-5">
      <span className="flex items-center gap-2 text-[13px] font-bold text-ink-2">
        <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-brand-soft text-brand-text">
          <LockIcon />
        </span>
        {t(`feature.${feature}`)}
        <span className="rounded-[6px] bg-brand-soft px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-brand-text-2">
          {plan}
        </span>
      </span>
      <p className="text-[12px] leading-relaxed text-ink-muted">{t("panelBody", { plan })}</p>
    </section>
  );
}
