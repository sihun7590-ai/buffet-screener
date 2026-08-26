import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import HeaderSearch from "./HeaderSearch";
import LocaleSwitcher from "./LocaleSwitcher";
import SignOutButton from "./SignOutButton";

export default async function SiteHeader() {
  const t = await getTranslations("nav");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3.5 border-b border-sidebar-border bg-[rgba(8,8,11,0.88)] px-4 backdrop-blur-[14px] sm:px-7">
      <HeaderSearch />

      <div className="ml-auto flex items-center gap-2">
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] border border-line-strong bg-surface-2 text-ink-muted">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M10 3a4.5 4.5 0 0 1 4.5 4.5c0 4 1.5 5 1.5 5H4s1.5-1 1.5-5A4.5 4.5 0 0 1 10 3Zm-1.6 12.5a1.7 1.7 0 0 0 3.2 0" />
          </svg>
        </span>

        <LocaleSwitcher />

        {user ? (
          <>
            <Link
              href="/mypage"
              className="flex h-[38px] items-center gap-2 rounded-[11px] border border-line-strong bg-surface-2 px-3 text-xs font-semibold text-ink-2 transition-colors hover:text-ink"
            >
              <span
                className="grid h-[26px] w-[26px] place-items-center rounded-lg text-[11px] font-extrabold text-white"
                style={{ background: "var(--brand-grad)" }}
              >
                {(user.email ?? "?").slice(0, 1).toUpperCase()}
              </span>
              {t("myPage")}
            </Link>
            <SignOutButton />
          </>
        ) : (
          <Link
            href="/login"
            className="flex h-[38px] items-center gap-2 rounded-[11px] border border-line-strong bg-surface-2 pl-1.5 pr-3 text-xs font-semibold text-ink-2 transition-colors hover:text-ink"
          >
            <span
              className="grid h-[26px] w-[26px] place-items-center rounded-lg text-[11px] font-extrabold text-white"
              style={{ background: "var(--brand-grad)" }}
            >
              S
            </span>
            {t("login")}
          </Link>
        )}
      </div>
    </header>
  );
}
