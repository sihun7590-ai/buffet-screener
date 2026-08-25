"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const WIDTH = 300;
const GAP = 8;
const EDGE = 8;
// Rough bubble height used only to decide whether to flip above the trigger.
const ESTIMATED_HEIGHT = 190;

type Placed = { top: number; left: number; above: boolean };

// A "?" affordance that explains a metric in plain language for people who
// have never read a financial statement. It renders the bubble in a portal
// with fixed positioning because most of these sit inside the scrollable
// table pane, which would otherwise clip the popover.
export default function InfoTip({ text, className = "" }: { text: string; className?: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);

  const open = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Flip above the trigger when the bubble wouldn't fit below it.
    const above = rect.bottom + GAP + ESTIMATED_HEIGHT > window.innerHeight && rect.top > ESTIMATED_HEIGHT;
    const half = WIDTH / 2;
    const centre = rect.left + rect.width / 2;
    const left = Math.min(Math.max(centre, EDGE + half), window.innerWidth - EDGE - half);
    setPlaced({ top: above ? rect.top - GAP : rect.bottom + GAP, left, above });
  };

  const close = () => setPlaced(null);

  // Any scroll moves the trigger out from under a fixed-position bubble, so
  // dismiss rather than chase it.
  useEffect(() => {
    if (!placed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [placed]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={text}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={(e) => {
          // Several of these live inside a clickable table row.
          e.stopPropagation();
          e.preventDefault();
          if (placed) close();
          else open();
        }}
        className={`grid h-[15px] w-[15px] shrink-0 cursor-help place-items-center rounded-full border border-line-strong text-[9px] font-bold leading-none text-ink-faint transition-colors hover:border-brand hover:bg-brand hover:text-white ${className}`}
      >
        ?
      </button>

      {placed &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[100] rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-[12px] leading-relaxed text-ink-muted shadow-[0_8px_28px_rgba(0,0,0,0.35)]"
            style={{
              width: WIDTH,
              top: placed.top,
              left: placed.left,
              transform: `translate(-50%, ${placed.above ? "-100%" : "0"})`,
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
