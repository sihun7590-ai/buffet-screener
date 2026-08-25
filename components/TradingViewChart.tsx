"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "./useTheme";
import ChartUnavailable from "./ChartUnavailable";

declare global {
  interface Window {
    TradingView?: { widget: new (options: Record<string, unknown>) => unknown };
  }
}

const SCRIPT_SRC = "https://s3.tradingview.com/tv.js";
let scriptLoadPromise: Promise<void> | null = null;

function loadTradingViewScript(): Promise<void> {
  if (window.TradingView) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Don't cache the failure — an ad blocker or a network blip shouldn't
      // permanently break the chart for the rest of the session.
      scriptLoadPromise = null;
      reject(new Error("Failed to load TradingView widget script"));
    };
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

// Embeds TradingView's free "Advanced Chart" widget — gives us daily/weekly/
// monthly candles and a full drawing toolbar (trend lines, channels,
// Fibonacci, ...) for free, without building any of that ourselves. The
// widget can't restyle itself after creation, so a theme switch rebuilds it.
export default function TradingViewChart({
  symbol,
  locale = "en",
  expanded = false,
}: {
  symbol: string;
  locale?: string;
  expanded?: boolean;
}) {
  const containerId = `tv-chart-${useId().replace(/:/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  // Bumping this re-runs the effect, which is what "try again" needs: the
  // loader clears its cached promise on failure, so a fresh attempt really
  // does re-request the script.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Pull the live token values so the chart canvas matches the panel it
    // sits in rather than TradingView's stock backgrounds.
    const css = getComputedStyle(document.documentElement);
    const surface = css.getPropertyValue("--surface").trim();
    const line = css.getPropertyValue("--line").trim();

    loadTradingViewScript()
      .then(() => {
        if (cancelled || !window.TradingView || !containerRef.current) return;
        setFailed(false);
        containerRef.current.innerHTML = "";
        new window.TradingView.widget({
          autosize: true,
          symbol,
          interval: "D",
          timezone: "Etc/UTC",
          theme,
          style: "1",
          locale,
          backgroundColor: surface,
          gridColor: line,
          toolbar_bg: surface,
          enable_publishing: false,
          allow_symbol_change: false,
          hide_side_toolbar: false,
          withdateranges: true,
          container_id: containerId,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, locale, theme, containerId, attempt]);

  if (failed) {
    // The troubleshooting steps are taller than the chart, so this pane grows
    // with its content instead of being pinned to the chart's height.
    return (
      <ChartUnavailable
        symbol={symbol}
        className={expanded ? "min-h-0 w-full flex-1" : "w-full"}
        onRetry={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  return (
    <div
      id={containerId}
      ref={containerRef}
      className={expanded ? "min-h-0 w-full flex-1" : "h-[420px] w-full sm:h-[560px]"}
    />
  );
}
