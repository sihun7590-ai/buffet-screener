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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-sidebar-border bg-[rgba(8,8,11,0.88)] px-3 backdrop-blur-[14px] sm:gap-3.5 sm:px-7">
      {/* The brand lives in the sidebar, which is hidden below lg — without
          this the logo would vanish entirely on a phone. Mark only: the
          wordmark would cost the search field a third of its width. */}
      <Link href="/" className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] lg:hidden" style={{ background: "var(--brand-grad)" }}>
        <svg viewBox="0 0 20 20" className="h-[17px] w-[17px]" fill="#fff" aria-hidden="true">
          <rect x="3" y="9" width="3.4" height="7.5" rx="1.2" />
          <rect x="8.3" y="5" width="3.4" height="11.5" rx="1.2" opacity="0.75" />
          <rect x="13.6" y="11" width="3.4" height="5.5" rx="1.2" />
        </svg>
        <span className="sr-only">{t("brand")}</span>
      </Link>

      <HeaderSearch />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {/* Decorative — there is no notification system behind it. Kept on
            desktop where it costs nothing, dropped on phones where every
            pixel it takes comes out of the search field. */}
        <span className="hidden h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px] border border-line-strong bg-surface-2 text-ink-muted sm:grid">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M10 3a4.5 4.5 0 0 1 4.5 4.5c0 4 1.5 5 1.5 5H4s1.5-1 1.5-5A4.5 4.5 0 0 1 10 3Zm-1.6 12.5a1.7 1.7 0 0 0 3.2 0" />
          </svg>
        </span>

        <LocaleSwitcher />

        {user ? (
          <>
            {/* The label drops below sm and the avatar carries the link on its
                own — the same destination is one tap away in the nav row
                underneath, so the words are redundant on a phone. */}
            <Link
              href="/mypage"
              className="flex h-[38px] items-center gap-2 rounded-[11px] border border-line-strong bg-surface-2 px-1.5 text-xs font-semibold text-ink-2 transition-colors hover:text-ink sm:px-3"
            >
              <span
                className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg text-[11px] font-extrabold text-white"
                style={{ background: "var(--brand-grad)" }}
              >
                {(user.email ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden sm:inline">{t("myPage")}</span>
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
