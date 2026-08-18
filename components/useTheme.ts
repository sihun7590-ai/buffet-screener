"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

// The theme's source of truth is `data-theme` on <html> — written before
// first paint by the inline script in layout.tsx, and read by every CSS
// token. React subscribes to that attribute rather than owning it, so the
// toggle and the TradingView chart always agree without passing state around.
function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

// Matches the `data-theme` the server renders; a stored "light" preference
// corrects itself on the first post-hydration read.
function getServerSnapshot(): Theme {
  return "dark";
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // Private browsing — the theme still applies for this page view.
  }
}
