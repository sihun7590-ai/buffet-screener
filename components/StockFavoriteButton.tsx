"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useFavorites } from "@/lib/supabase/useFavorites";
import FavoriteButton from "./FavoriteButton";

export default function StockFavoriteButton({ ticker, price }: { ticker: string; price: number }) {
  const t = useTranslations("favorite");
  const router = useRouter();
  const { isSignedIn, favorites, toggle } = useFavorites();
  const active = favorites.has(ticker);

  return (
    <FavoriteButton
      size="md"
      active={active}
      title={t(active ? "remove" : "add")}
      className="h-9 w-9 border border-line bg-subtle hover:border-line-strong"
      onToggle={() => {
        if (isSignedIn === false) {
          router.push("/login");
          return;
        }
        toggle(ticker, price);
      }}
    />
  );
}
