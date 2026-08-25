"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const t = useTranslations("nav");
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/");
        router.refresh();
      }}
      className="h-8 rounded-md border border-line bg-subtle px-2.5 text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {t("signOut")}
    </button>
  );
}
