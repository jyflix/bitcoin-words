import { Bitcoin } from "lucide-react";
import type { SVGProps } from "react";
import type { ChainId } from "@/lib/types";

export function EthereumGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.25 5.6 12.55 12 16.35l6.4-3.8L12 2.25Z" />
      <path d="M12 17.6 5.6 13.8 12 21.75l6.4-7.95-6.4 3.8Z" opacity="0.65" />
    </svg>
  );
}

/** Uses the shared #sol-gradient defined once by <GradientDefs />. */
export function SolanaGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="url(#sol-gradient)" aria-hidden="true" {...props}>
      <path d="M7.4 4.75h12.6l-2.9 3.1H4.5l2.9-3.1ZM4.5 10.45h12.6l2.9 3.1H7.4l-2.9-3.1ZM7.4 16.15h12.6l-2.9 3.1H4.5l2.9-3.1Z" />
    </svg>
  );
}

export function GradientDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" className="absolute">
      <defs>
        <linearGradient id="sol-gradient" x1="4" y1="19" x2="20" y2="5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945ff" />
          <stop offset="1" stopColor="#19fb9b" />
        </linearGradient>
        <linearGradient id="brand-gradient" x1="0" y1="32" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f7931a" />
          <stop offset="0.55" stopColor="#9945ff" />
          <stop offset="1" stopColor="#19fb9b" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const BADGE: Record<ChainId, string> = {
  btc: "bg-btc/10 text-btc ring-btc/25",
  eth: "bg-eth/10 text-eth ring-eth/25",
  sol: "bg-sol-purple/15 text-sol ring-sol/20",
};

const SIZES = {
  sm: { box: "size-6 rounded-md", glyph: "size-3.5" },
  md: { box: "size-9 rounded-lg", glyph: "size-5" },
  lg: { box: "size-11 rounded-xl", glyph: "size-6" },
};

export function ChainBadge({ chain, size = "md" }: { chain: ChainId; size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ring-1 ring-inset ${s.box} ${BADGE[chain]}`}
    >
      {chain === "btc" ? (
        <Bitcoin className={s.glyph} strokeWidth={2.25} aria-hidden="true" />
      ) : chain === "eth" ? (
        <EthereumGlyph className={s.glyph} />
      ) : (
        <SolanaGlyph className={s.glyph} />
      )}
    </span>
  );
}

export function Logo({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="url(#brand-gradient)" />
      <circle cx="16" cy="16" r="7.25" fill="none" stroke="#fff" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="2.4" fill="#fff" />
    </svg>
  );
}
