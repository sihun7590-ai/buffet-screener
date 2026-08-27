"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

// Icon paths and routes from the design handoff's nav list — see
// design_handoff_screener_redesign/README.md "Sidebar" section.
//
// Two of the handoff's five entries are gone, both because they had nowhere to
// go. "Stock detail" pointed at "/" since there is no canonical detail route,
// so it lit up on a stock page and sent you to the dashboard from anywhere
// else. "Account" pointed at /login, which every visitor has already passed —
// proxy.ts gates the whole site — and signing out lives in the header. A nav
// item that cannot take you somewhere new is a button that lies.
const ITEMS = [
  { id: "dashboard", href: "/", icon: "M3.5 10 10 4l6.5 6M5.5 9v7h9V9", match: (p: string) => p === "/" },
  { id: "backtest", href: "/backtest", icon: "M4 16V8m4 8V4m4 12v-6m4 6V6", match: (p: string) => p.startsWith("/backtest") },
  {
    id: "myPage",
    href: "/mypage",
    icon: "M10 16.5S3.8 12.4 3.8 8A3.6 3.6 0 0 1 10 5.6 3.6 3.6 0 0 1 16.2 8c0 4.4-6.2 8.5-6.2 8.5Z",
    match: (p: string) => p.startsWith("/mypage"),
  },
] as const;

export default function SidebarNav() {
  const t = useTranslations("sidebar");
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.id}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-[13px] font-semibold transition-colors ${
              active ? "bg-brand-soft text-brand-text-2" : "text-ink-muted hover:bg-[#17171f] hover:text-ink"
            }`}
          >
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d={item.icon} />
              </svg>
            </span>
            <span>{t(item.id)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
