"use client";

export default function FavoriteButton({
  active,
  onToggle,
  size = "md",
  title,
  className = "",
}: {
  active: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
  title?: string;
  className?: string;
}) {
  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={active}
      aria-label={title}
      title={title}
      className={`grid shrink-0 place-items-center rounded-md transition-transform hover:scale-110 active:scale-95 ${className}`}
    >
      <svg
        viewBox="0 0 20 20"
        className={dim}
        fill={active ? "var(--brand)" : "none"}
        stroke={active ? "var(--brand)" : "currentColor"}
        strokeWidth="1.6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 17.2S2.8 12.6 2.8 7.6a4 4 0 0 1 7.2-2.4 4 4 0 0 1 7.2 2.4c0 5-7.2 9.6-7.2 9.6Z"
        />
      </svg>
    </button>
  );
}
