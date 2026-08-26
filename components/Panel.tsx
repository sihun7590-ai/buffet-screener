import type { ReactNode } from "react";

// Every card on the site is one of these, so the terminal's panel chrome
// (border, header rule, uppercase caption) stays identical everywhere.
export default function Panel({
  title,
  trailing,
  children,
  padded = true,
  className = "",
}: {
  title?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-[20px] border border-line bg-surface ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.13em] text-ink-muted">{title}</h2>
          {trailing}
        </div>
      )}
      <div className={padded ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}
