"use client";

import { ChevronDown, Eye, EyeOff, SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";
import { CHAIN_IDS, CHAINS, type ChainId } from "@/lib/types";
import { ChainBadge } from "./chain-icons";

export const DEPTHS = [
  { value: 5, label: "Quick" },
  { value: 10, label: "Standard" },
  { value: 20, label: "Deep" },
] as const;

interface ScanOptionsProps {
  passphrase: string;
  onPassphraseChange: (value: string) => void;
  count: number;
  onCountChange: (value: number) => void;
  chains: Record<ChainId, boolean>;
  onChainsChange: (value: Record<ChainId, boolean>) => void;
}

export function ScanOptions({
  passphrase,
  onPassphraseChange,
  count,
  onCountChange,
  chains,
  onChainsChange,
}: ScanOptionsProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState(false);

  const selected = CHAIN_IDS.filter((c) => chains[c]);
  const summary = [
    selected.length === 3 ? "All networks" : selected.map((c) => CHAINS[c].symbol).join(" + ") || "No network",
    `${count} per path`,
    passphrase ? "passphrase on" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <span className="flex shrink-0 items-center gap-2 text-sm font-medium whitespace-nowrap text-zinc-200">
          <SlidersHorizontal className="size-4 text-zinc-400" aria-hidden="true" />
          Advanced options
        </span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
          <span className="truncate">{summary}</span>
          <ChevronDown
            className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open ? (
        <div id={`${id}-panel`} className="grid gap-6 border-t border-white/[0.06] px-4 pt-4 pb-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor={`${id}-passphrase`} className="text-sm font-medium text-zinc-200">
              BIP39 passphrase <span className="font-normal text-zinc-500">(optional “25th word”)</span>
            </label>
            <div className="relative mt-2">
              <input
                id={`${id}-passphrase`}
                type={reveal ? "text" : "password"}
                value={passphrase}
                onChange={(e) => onPassphraseChange(e.target.value)}
                placeholder="Leave empty unless you set one"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/40 pr-11 pl-3.5 font-mono text-sm text-zinc-100 outline-none transition placeholder:font-sans placeholder:text-zinc-600 focus:border-white/25 focus:ring-4 focus:ring-white/5"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? "Hide passphrase" : "Show passphrase"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-500 transition hover:text-zinc-200"
              >
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Case- and space-sensitive. A different passphrase opens a completely different wallet, so only fill
              this in if you set one up.
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-zinc-200">Scan depth</legend>
            <div role="radiogroup" className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
              {DEPTHS.map((depth) => {
                const active = depth.value === count;
                return (
                  <button
                    key={depth.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onCountChange(depth.value)}
                    className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
                      active ? "bg-white text-zinc-950 shadow" : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
                    }`}
                  >
                    {depth.label}
                    <span className={`ml-1 tabular-nums ${active ? "text-zinc-500" : "text-zinc-600"}`}>
                      {depth.value}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Addresses per path. For Bitcoin it’s the gap limit: scanning continues until this many unused
              addresses in a row.
            </p>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-zinc-200">Networks</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {CHAIN_IDS.map((chain) => {
                const on = chains[chain];
                return (
                  <button
                    key={chain}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => onChainsChange({ ...chains, [chain]: !on })}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-medium transition ${
                      on
                        ? "border-white/20 bg-white/[0.06] text-zinc-100"
                        : "border-white/[0.06] text-zinc-500 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <ChainBadge chain={chain} size="sm" />
                    {CHAINS[chain].symbol}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Your Ethereum address is the same on every EVM network (Base, Arbitrum, BNB Chain…).
            </p>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
