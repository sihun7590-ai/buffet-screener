"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "./client";

export interface FavoriteRow {
  ticker: string;
  price_at_favorite: number;
  favorited_at: string;
}

// Shared by the dashboard table (many tickers, one bulk load) and the stock
// detail page (a single ticker) — both just need to know which tickers the
// signed-in user has hearted and a way to flip one.
export function useFavorites() {
  // undefined = auth state not resolved yet; null = resolved, signed out.
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [favorites, setFavorites] = useState<Map<string, FavoriteRow>>(new Map());

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const loadFavorites = async (uid: string) => {
      const { data } = await supabase.from("favorites").select("ticker, price_at_favorite, favorited_at").eq("user_id", uid);
      if (cancelled) return;
      setFavorites(new Map((data ?? []).map((row) => [row.ticker, row as FavoriteRow])));
    };

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) loadFavorites(uid);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        loadFavorites(uid);
      } else {
        setFavorites(new Map());
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const toggle = useCallback(
    async (ticker: string, priceAtFavorite: number) => {
      if (!userId) return "signed-out" as const;
      const supabase = createClient();

      if (favorites.has(ticker)) {
        setFavorites((prev) => {
          const next = new Map(prev);
          next.delete(ticker);
          return next;
        });
        await supabase.from("favorites").delete().eq("user_id", userId).eq("ticker", ticker);
      } else {
        const row: FavoriteRow = { ticker, price_at_favorite: priceAtFavorite, favorited_at: new Date().toISOString() };
        setFavorites((prev) => new Map(prev).set(ticker, row));
        await supabase.from("favorites").insert({ user_id: userId, ticker, price_at_favorite: priceAtFavorite });
      }
      return "ok" as const;
    },
    [userId, favorites],
  );

  return {
    isSignedIn: userId === undefined ? undefined : userId !== null,
    favorites,
    toggle,
  };
}
