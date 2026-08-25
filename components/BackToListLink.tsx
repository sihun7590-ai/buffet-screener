import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// The one way back to the screener table, shared by every page that isn't it,
// so the affordance looks and reads identically wherever it appears.
export default async function BackToListLink() {
  const t = await getTranslations("stock");

  return (
    <Link
      href="/"
      className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-brand"
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="m12 5-5 5 5 5" />
      </svg>
      {t("backToList")}
    </Link>
  );
}
