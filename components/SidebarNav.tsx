"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { NAV_ITEMS } from "./navItems";

/**
 * The nav links, laid out down the sidebar on desktop and across a row under
 * the header on phones.
 *
 * Three destinations fit on a 320px row with space to spare, which is why this
 * is a row rather than a hamburger drawer: a drawer would add a tap, a panel,
 * an overlay and focus management to hide three links that were never in the
 * way. It becomes worth building when there are enough links to need it.
 */
export default function SidebarNav({ orientation = "vertical" }: { orientation?: "vertical" | "horizontal" }) {
  const t = useTranslations("sidebar");
  const pathname = usePathname();
  const horizontal = orientation === "horizontal";

  return (
    <nav className={horizontal ? "flex items-center gap-1.5" : "flex flex-col gap-1"}>
      {NAV_ITEMS.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-[11px] font-semibold transition-colors ${
              horizontal ? "shrink-0 px-2.5 py-2 text-[12px]" : "gap-2.5 px-3 py-2.5 text-[13px]"
            } ${active ? "bg-brand-soft text-brand-text-2" : "text-ink-muted hover:bg-[#17171f] hover:text-ink"}`}
          >
            <span className={`grid shrink-0 place-items-center ${horizontal ? "h-4 w-4" : "h-[18px] w-[18px]"}`}>
              <svg
                viewBox="0 0 20 20"
                className={horizontal ? "h-[15px] w-[15px]" : "h-4 w-4"}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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
