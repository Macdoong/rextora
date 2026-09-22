"use client";

const GLYPH_IDS = [
  "ema_core",
  "rsi_pullback",
  "breakout",
  "risk_exits",
  "full_safe",
  "order_block",
  "fvg",
  "trendline",
  "support_resistance",
  "supply_demand",
] as const;

export type SearchFamilyGlyphId = (typeof GLYPH_IDS)[number] | string;

function mark(id: string): string {
  return GLYPH_IDS.includes(id as (typeof GLYPH_IDS)[number])
    ? id
    : "generic";
}

export function SearchFamilyGlyph({
  id,
  className,
}: {
  id: SearchFamilyGlyphId;
  className?: string;
}) {
  const kind = mark(id);
  return (
    <svg
      className={className ?? "ss-family-glyph"}
      viewBox="0 0 20 20"
      width="16"
      height="16"
      aria-hidden="true"
      data-family-glyph={kind}
      focusable="false"
    >
      {kind === "ema_core" ? (
        <path
          d="M3 14.5 7.2 9.2 10.4 12.1 17 5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : kind === "rsi_pullback" ? (
        <path
          d="M3 7c2.4 0 2.4 6 5 6s2.6-6 5-6 2.4 6 4 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ) : kind === "breakout" ? (
        <>
          <path
            d="M3 13h8M3 13l4-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M11 13 17 5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      ) : kind === "risk_exits" ? (
        <path
          d="M10 3.2 16.2 6v4.4c0 3.4-2.5 5.7-6.2 6.8C6.3 16.1 3.8 13.8 3.8 10.4V6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      ) : kind === "full_safe" ? (
        <>
          <circle
            cx="10"
            cy="10"
            r="6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle cx="10" cy="10" r="2.1" fill="currentColor" />
        </>
      ) : kind === "order_block" ? (
        <rect
          x="4"
          y="5"
          width="12"
          height="10"
          rx="1.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      ) : kind === "fvg" ? (
        <>
          <rect x="4" y="3.5" width="12" height="4" rx="0.8" fill="currentColor" opacity="0.35" />
          <rect x="4" y="12.5" width="12" height="4" rx="0.8" fill="currentColor" opacity="0.35" />
          <rect
            x="4.5"
            y="8.2"
            width="11"
            height="3.6"
            rx="0.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeDasharray="2 1.4"
          />
        </>
      ) : kind === "trendline" ? (
        <path
          d="M3.5 15.5 16.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ) : kind === "support_resistance" ? (
        <>
          <path d="M3 6.5h14M3 13.5h14" stroke="currentColor" strokeWidth="1.6" />
        </>
      ) : kind === "supply_demand" ? (
        <>
          <rect x="3.5" y="3.8" width="13" height="5" rx="1" fill="currentColor" opacity="0.28" />
          <rect x="3.5" y="11.2" width="13" height="5" rx="1" fill="currentColor" opacity="0.5" />
        </>
      ) : (
        <circle
          cx="10"
          cy="10"
          r="5.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      )}
    </svg>
  );
}
