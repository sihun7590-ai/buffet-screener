"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

const SCRIPT_URL = "https://s3.tradingview.com/tv.js";
const STEPS = ["step1", "step2", "step3", "step4", "step5", "step6"] as const;

// Shown when TradingView's script never loads. The causes are all on the
// visitor's side (ad blocker, corporate firewall, or — the one that's easy to
// miss — locally installed security software doing HTTPS interception with a
// root certificate the browser rejects), so the panel walks through them in
// the order that's quickest to check rather than just apologising.
export default function ChartUnavailable({
  symbol,
  onRetry,
  className = "",
}: {
  symbol: string;
  onRetry: () => void;
  className?: string;
}) {
  const t = useTranslations("stock");

  const rich = {
    b: (chunks: ReactNode) => <b className="font-semibold text-ink-muted">{chunks}</b>,
    link: (chunks: ReactNode) => (
      <a
        href={SCRIPT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-brand underline underline-offset-2"
      >
        {chunks}
      </a>
    ),
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-3 overflow-y-auto px-4 py-10 ${className}`}>
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.5v4.5m0 3h.01M12 3.2 21.5 20H2.5L12 3.2Z" />
      </svg>

      <p className="text-sm font-semibold text-ink">{t("chartUnavailable")}</p>
      <p className="max-w-md text-center text-xs leading-relaxed text-ink-faint">{t("chartUnavailableHint")}</p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="h-8 rounded-md bg-brand px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t("chartRetry")}
        </button>
        <a
          href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 items-center rounded-md border border-line bg-subtle px-3 text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          {t("chartOpenInTradingView")}
        </a>
      </div>

      <details className="mt-1 w-full max-w-lg rounded-lg border border-line bg-subtle">
        <summary className="cursor-pointer list-none px-3.5 py-2.5 text-xs font-semibold text-ink-muted transition-colors marker:content-none hover:text-ink">
          {t("chartHelp.summary")}
        </summary>
        <ol className="flex list-decimal flex-col gap-2.5 border-t border-line px-3.5 py-3 pl-8 text-left text-[12px] leading-relaxed text-ink-faint">
          {STEPS.map((step) => (
            <li key={step}>{t.rich(`chartHelp.${step}`, rich)}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
