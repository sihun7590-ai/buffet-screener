"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import universe from "@/data/universe.json";

const MAX_RESULTS = 8;

// A lightweight "jump to ticker" box, not a full command palette — it only
// ever does one thing (navigate to a stock), so there's no need for the
// overlay/registry machinery a real Cmd-K palette would carry.
export default function HeaderSearch() {
  const t = useTranslations("nav");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return universe
      .filter((u) => u.ticker.toLowerCase().startsWith(q) || u.companyName.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.ticker.toLowerCase().startsWith(q)) - Number(!b.ticker.toLowerCase().startsWith(q)))
      .slice(0, MAX_RESULTS);
  }, [query]);

  const go = (ticker: string) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(`/stock/${ticker}`);
  };

  return (
    // min-w-0 rather than a floor: a flex item defaults to min-width:auto and
    // refuses to shrink below its content, which on a 375px header pushed the
    // account controls off the right edge. The field is a typeahead, so a
    // narrow box is still usable — the results list is full width regardless.
    <div className="relative min-w-0 flex-1 sm:max-w-[380px]">
      <svg
        viewBox="0 0 20 20"
        className="pointer-events-none absolute left-[13px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-ink-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="8.8" cy="8.8" r="5.4" />
        <path strokeLinecap="round" d="m13 13 4 4" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[activeIndex]) {
            go(results[activeIndex].ticker);
          }
        }}
        placeholder={t("searchPlaceholder")}
        className="h-[38px] w-full rounded-[11px] border border-line-strong bg-surface-2 py-0 pl-9 pr-11 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] font-semibold text-ink-6">
        &#8984;K
      </span>

      {/* The list is anchored to the field but not bound to its width. Once the
          field shrinks to ~110px on a phone, inheriting that width truncates
          every company name to a few characters; growing rightwards from the
          field's left edge keeps the results readable and still lands well
          inside a 375px screen. */}
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 min-w-[240px] overflow-hidden rounded-[11px] border border-line-strong bg-surface shadow-[0_12px_32px_rgba(0,0,0,0.5)] sm:min-w-0">
          {results.map((r, i) => (
            <li key={r.ticker}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(r.ticker)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] ${i === activeIndex ? "bg-surface-4" : ""}`}
              >
                <span className="font-mono font-bold text-ink">{r.ticker}</span>
                <span className="truncate text-ink-faint">{r.companyName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
