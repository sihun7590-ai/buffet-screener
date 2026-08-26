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
    <aside className="sticky top-0 flex h-screen w-[236px] shrink-0 flex-col gap-7 overflow-y-auto border-r border-sidebar-border bg-canvas-sidebar p-4">
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

      <div className="mt-auto flex flex-col gap-1">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-[11px] px-3 py-2.5 text-[13px] font-semibold text-ink-muted transition-colors hover:bg-[#17171f] hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="10" cy="10" r="2.6" />
            <path d="M10 3v2m0 10v2M3 10h2m10 0h2M5.2 5.2l1.4 1.4m6.8 6.8 1.4 1.4m0-9.6-1.4 1.4M6.6 13.4l-1.4 1.4" />
          </svg>
          <span>{tSidebar("weights")}</span>
        </Link>
        <div className="flex items-center justify-between rounded-[11px] px-3 py-2.5 text-[13px] font-semibold text-ink-muted">
          <span>{tSidebar("darkMode")}</span>
          <span className="flex h-[18px] w-8 items-center justify-end rounded-full bg-brand px-[3px]" aria-hidden="true">
            <span className="block h-3 w-3 rounded-full bg-white" />
          </span>
        </div>
      </div>
    </aside>
  );
}
