"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useFavorites } from "@/lib/supabase/useFavorites";
import FavoriteButton from "./FavoriteButton";

export default function StockFavoriteButton({
  ticker,
  price,
  variant = "icon",
}: {
  ticker: string;
  price: number;
  variant?: "icon" | "prominent";
}) {
  const t = useTranslations("favorite");
  const router = useRouter();
  const { isSignedIn, favorites, toggle } = useFavorites();
  const active = favorites.has(ticker);

  const onToggle = () => {
    if (isSignedIn === false) {
      router.push("/login");
      return;
    }
    toggle(ticker, price);
  };

  if (variant === "prominent") {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        title={t(active ? "remove" : "add")}
        className="flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-xs font-bold text-white transition-opacity hover:opacity-90"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill={active ? "#fff" : "none"} stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 16.5S3.8 12.4 3.8 8A3.6 3.6 0 0 1 10 5.6 3.6 3.6 0 0 1 16.2 8c0 4.4-6.2 8.5-6.2 8.5Z" />
        </svg>
        {t("label")}
      </button>
    );
  }

  return (
    <FavoriteButton
      size="md"
      active={active}
      title={t(active ? "remove" : "add")}
      className="h-9 w-9 border border-line bg-subtle hover:border-line-strong"
      onToggle={onToggle}
    />
  );
}
