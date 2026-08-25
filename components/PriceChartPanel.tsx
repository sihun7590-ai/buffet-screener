"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import TradingViewChart from "./TradingViewChart";
import InfoTip from "./InfoTip";

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={
          expanded
            ? "M8.5 3v5.5H3M11.5 17v-5.5H17M3.5 3.5 8 8M16.5 16.5 12 12"
            : "M12.5 3H17v4.5M7.5 17H3v-4.5M17 3l-5.5 5.5M3 17l5.5-5.5"
        }
      />
    </svg>
  );
}

// Owns the chart's panel chrome so the expand toggle can live in the header.
// Expanding is driven by our own fixed-overlay layout, with the native
// Fullscreen API requested on top of it as a bonus — embedded webviews and
// iOS Safari don't support Element.requestFullscreen, and the chart still
// needs to fill the screen there.
export default function PriceChartPanel({ symbol, locale }: { symbol: string; locale: string }) {
  const t = useTranslations("stock");
  const tGlossary = useTranslations("glossary");
  const wrapRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  const collapse = useCallback(() => {
    setExpanded(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  const toggle = () => {
    if (expanded) {
      collapse();
      return;
    }
    setExpanded(true);
    void wrapRef.current?.requestFullscreen?.().catch(() => {
      // Not available here — the fixed overlay below carries the behaviour.
    });
  };

  // Leaving native fullscreen (Esc, or the browser's own control) has to take
  // the overlay down with it, and Esc has to work when there's no native
  // fullscreen to leave.
  useEffect(() => {
    if (!expanded) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") collapse();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded, collapse]);

  const buttonClass =
    "flex h-7 items-center gap-1.5 rounded-md border border-line bg-subtle px-2 text-[11px] font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink";

  return (
    <div ref={wrapRef} className={expanded ? "fixed inset-0 z-50 flex flex-col bg-canvas p-2 sm:p-3" : ""}>
      <section
        className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow)] ${
          expanded ? "flex-1" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-ink-muted">
            <span>{t("priceChart")}</span>
            <InfoTip text={tGlossary("priceChart")} />
          </h2>
          <div className="flex items-center gap-2">
            <a
              href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass}
            >
              {t("chartOpenInTradingView")}
              <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 4H4.5v11.5H16V12M11 3h6v6M17 3l-7.5 7.5" />
              </svg>
            </a>
            <button
              type="button"
              onClick={toggle}
              title={t(expanded ? "chartExitFullscreen" : "chartFullscreen")}
              aria-label={t(expanded ? "chartExitFullscreen" : "chartFullscreen")}
              className={buttonClass}
            >
              <ExpandIcon expanded={expanded} />
            </button>
          </div>
        </div>

        <TradingViewChart symbol={symbol} locale={locale} expanded={expanded} />

        {!expanded && (
          <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-ink-faint">
            {t("chartDrawingsNote")}
          </p>
        )}
      </section>
    </div>
  );
}
