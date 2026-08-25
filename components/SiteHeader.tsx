import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import LocaleSwitcher from "./LocaleSwitcher";
import ThemeToggle from "./ThemeToggle";
import SignOutButton from "./SignOutButton";

function Logo() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/15 ring-1 ring-brand/25">
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden="true">
        <g stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M5 3.2v13.6M10 1.8v16.4M15 5.4v9.2" />
        </g>
        <g fill="var(--brand)">
          <rect x="3.1" y="6.2" width="3.8" height="7" rx="1.1" />
          <rect x="8.1" y="4.4" width="3.8" height="9" rx="1.1" opacity="0.5" />
          <rect x="13.1" y="8.2" width="3.8" height="5" rx="1.1" />
        </g>
      </svg>
    </span>
  );
}

export default async function SiteHeader() {
  const t = await getTranslations("nav");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <Logo />
          <span className="flex flex-col leading-none">
            <span className="font-mono text-[13px] font-bold tracking-tight text-ink transition-colors group-hover:text-brand">
              {t("brand")}
            </span>
            <span className="mt-1 text-[10px] font-medium text-ink-faint">{t("tagline")}</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/mypage"
                className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-subtle px-2.5 text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10 17S3.3 12.7 3.3 8a3.7 3.7 0 0 1 6.7-2.2A3.7 3.7 0 0 1 16.7 8c0 4.7-6.7 9-6.7 9Z"
                  />
                </svg>
                {t("myPage")}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="flex h-8 items-center rounded-md border border-line bg-subtle px-2.5 text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              {t("login")}
            </Link>
          )}
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
