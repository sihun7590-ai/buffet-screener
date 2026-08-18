"use client";

import { useTranslations } from "next-intl";
import { applyTheme, useTheme } from "./useTheme";

export default function ThemeToggle() {
  const t = useTranslations("theme");
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = t(next === "dark" ? "toDark" : "toLight");

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-md border border-line bg-subtle text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="10" cy="10" r="3.4" />
          <path
            strokeLinecap="round"
            d="M10 2.2v1.6M10 16.2v1.6M17.8 10h-1.6M3.8 10H2.2M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1M15.5 15.5l-1.1-1.1M5.6 5.6L4.5 4.5"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinejoin="round" d="M16.5 11.8A7 7 0 0 1 8.2 3.5a7 7 0 1 0 8.3 8.3Z" />
        </svg>
      )}
    </button>
  );
}
