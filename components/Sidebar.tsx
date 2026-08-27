import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { readScores } from "@/lib/store";
import SidebarNav from "./SidebarNav";

export default async function Sidebar() {
  const t = await getTranslations("nav");
  const tSidebar = await getTranslations("sidebar");
  const { generatedAt } = readScores();

  const asOfLabel = generatedAt
    ? new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(new Date(generatedAt))
        .replace(/\. /g, ".")
        .replace(/\.$/, "")
    : null;

  return (
    // Hidden below lg, where 236px of fixed chrome would take nearly two
    // thirds of a 375px phone and leave the screener itself about 140px to
    // render 500 companies in. The three nav links move to a row under the
    // header (MobileNav); the data-provenance card below is desktop-only,
    // since the stock pages carry the same information inline.
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col gap-7 overflow-y-auto border-r border-sidebar-border bg-canvas-sidebar p-4 lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-1.5">
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px]" style={{ background: "var(--brand-grad)" }}>
          <svg viewBox="0 0 20 20" className="h-[17px] w-[17px]" fill="#fff" aria-hidden="true">
            <rect x="3" y="9" width="3.4" height="7.5" rx="1.2" />
            <rect x="8.3" y="5" width="3.4" height="11.5" rx="1.2" opacity="0.75" />
            <rect x="13.6" y="11" width="3.4" height="5.5" rx="1.2" />
          </svg>
        </span>
        <span className="flex flex-col gap-0.5 leading-none">
          <span className="text-[15px] font-extrabold tracking-tight text-ink">{t("brand")}</span>
          <span className="text-[10px] font-semibold tracking-[0.06em] text-ink-faint">S&amp;P 500 VALUE</span>
        </span>
      </Link>

      <SidebarNav />

      <div className="flex flex-col gap-2.5 rounded-2xl border border-panel-border p-4" style={{ background: "linear-gradient(160deg,#191527,#101018)" }}>
        <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: "#8b7bff" }}>
          {tSidebar("asOf")}
        </span>
        {asOfLabel ? (
          <span className="font-mono text-[13px] font-semibold tabular-nums text-ink">{asOfLabel}</span>
        ) : (
          <span className="text-[12px] text-ink-faint">{tSidebar("asOfEmpty")}</span>
        )}
        <span className="text-[11px] leading-relaxed text-ink-4">
          {tSidebar("sourceFinancials")}
          <br />
          {tSidebar("sourcePrices")}
        </span>
      </div>

      {/* The foot of the sidebar used to carry two more controls, both removed
          for the same reason as the stock-detail and account nav items: a
          "weight settings" link that was an href="/" and opened nothing (the
          panel is opened by the dashboard's own button), and a "dark mode"
          switch that was a div with no handler — a toggle left drawn on the
          page after the redesign deleted ThemeToggle.tsx. A control that looks
          operable and isn't reads as a broken site, not a missing feature. */}
    </aside>
  );
}
