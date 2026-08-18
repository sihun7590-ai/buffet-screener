import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import LocaleSwitcher from "./LocaleSwitcher";
import ThemeToggle from "./ThemeToggle";

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
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
