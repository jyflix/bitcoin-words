"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Loader2,
  RotateCw,
  Square,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import { EXPLORERS } from "@/lib/explorers";
import { formatAmount, formatPrice, formatUsd, shortenAddress } from "@/lib/format";
import { chainTotals, isActive, isNotable, sumEntries, type Totals } from "@/lib/totals";
import {
  CHAIN_IDS,
  CHAINS,
  type AddressEntry,
  type AddressGroup,
  type ChainId,
  type ChainScanStatus,
  type Prices,
  type ScanSnapshot,
} from "@/lib/types";
import { ChainBadge } from "./chain-icons";
import { CopyButton } from "./copy-button";

interface ResultsProps {
  snapshot: ScanSnapshot;
  onRescan: () => void;
  onStop: () => void;
}

export function Results({ snapshot, onRescan, onStop }: ResultsProps) {
  const [hideEmpty, setHideEmpty] = useState(false);
  const running = snapshot.status === "running";
  const chainIds = CHAIN_IDS.filter((c) => snapshot.chains[c]);

  const totals = useMemo(() => {
    const out = {} as Record<ChainId, Totals>;
    for (const chain of CHAIN_IDS) out[chain] = chainTotals(snapshot.groups, chain, snapshot.prices);
    return out;
  }, [snapshot.groups, snapshot.prices]);

  const scanned = chainIds.filter((c) => snapshot.chains[c]?.status !== "skipped");
  const missingPrice = scanned.some((c) => totals[c].usd === null);
  const totalUsd = scanned.reduce((sum, c) => sum + (totals[c].usd ?? 0), 0);
  const funded = scanned.reduce((sum, c) => sum + totals[c].funded, 0);
  const partial = scanned.some((c) => snapshot.chains[c]?.status === "error");

  return (
    <section id="results" className="mt-8 scroll-mt-6 space-y-4 animate-fade-up" aria-label="Results">
      <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-950/70 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <div className="relative h-0.5 overflow-hidden bg-white/[0.04]">
          {running ? (
            <div className="absolute inset-y-0 w-2/5 animate-indeterminate bg-linear-to-r from-transparent via-white/70 to-transparent" />
          ) : null}
        </div>

        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-wider text-zinc-500 uppercase">Total balance</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                {running && snapshot.checked === 0 ? (
                  <span className="skeleton inline-block h-11 w-48 rounded-xl align-middle" />
                ) : (
                  <span className={totalUsd > 0 ? "text-white" : "text-zinc-300"}>
                    {formatUsd(totalUsd)}
                    {missingPrice ? <span className="text-zinc-500">+</span> : null}
                  </span>
                )}
              </p>
              <p className="mt-2 text-sm text-zinc-500" aria-live="polite">
                <StatusText snapshot={snapshot} funded={funded} />
                {partial && !running ? <span className="text-amber-300/90"> · some lookups failed</span> : null}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {running ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3.5 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <Square className="size-3.5 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onRescan}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3.5 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <RotateCw className="size-3.5" />
                  Check again
                </button>
              )}
            </div>
          </div>

          {chainIds.length > 0 ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {chainIds.map((chain) => (
                <ChainSummary
                  key={chain}
                  chain={chain}
                  totals={totals[chain]}
                  status={snapshot.chains[chain]!.status}
                  prices={snapshot.prices}
                />
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <Toggle checked={hideEmpty} onChange={setHideEmpty} label="Only show addresses with activity" />
            <p className="text-xs text-zinc-600">
              {snapshot.prices
                ? `Prices: ${snapshot.prices.source} · stablecoins at $1`
                : snapshot.pricesError
                  ? "Prices unavailable — balances shown in native units"
                  : "Fetching prices…"}
            </p>
          </div>
        </div>
      </div>

      {snapshot.status === "error" && snapshot.error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/[0.07] p-4 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {snapshot.error}
        </div>
      ) : null}

      {chainIds.map((chain) => (
        <ChainCard
          key={chain}
          chain={chain}
          state={snapshot.chains[chain]!}
          groups={snapshot.groups.filter((g) => g.chain === chain && !g.hidden)}
          totals={totals[chain]}
          prices={snapshot.prices}
          hideEmpty={hideEmpty}
        />
      ))}
    </section>
  );
}

function StatusText({ snapshot, funded }: { snapshot: ScanSnapshot; funded: number }) {
  const checked = `${snapshot.checked} address${snapshot.checked === 1 ? "" : "es"}`;
  if (snapshot.status === "running") {
    return snapshot.checked === 0 ? <>Deriving addresses…</> : <>Checking balances · {checked} so far</>;
  }
  const found = funded > 0 ? `${funded} funded` : "no funds found";
  if (snapshot.status === "stopped") return <>Stopped after {checked} · {found}</>;
  if (snapshot.status === "error") return <>Scan failed</>;
  const took = snapshot.finishedAt ? ` in ${((snapshot.finishedAt - snapshot.startedAt) / 1000).toFixed(1)}s` : "";
  return (
    <>
      Checked {checked}
      {took} · {found}
    </>
  );
}

function ChainSummary({
  chain,
  totals,
  status,
  prices,
}: {
  chain: ChainId;
  totals: Totals;
  status: ChainScanStatus;
  prices: Prices | null;
}) {
  const meta = CHAINS[chain];
  const skipped = status === "skipped";
  const unavailable = status === "error" && totals.checked === 0;
  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 ${skipped ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ChainBadge chain={chain} size="sm" />
          <span className="text-sm font-medium text-zinc-300">{meta.name}</span>
        </div>
        <StatusIcon status={status} />
      </div>
      <p className="mt-3 truncate font-mono text-lg tabular-nums text-zinc-100">
        {skipped || unavailable ? "—" : formatAmount(totals.native, meta.decimals, meta.displayDecimals)}
        <span className="ml-1.5 text-sm text-zinc-500">{meta.symbol}</span>
      </p>
      <p className="mt-0.5 truncate text-xs text-zinc-500 tabular-nums">
        {skipped
          ? "Not applicable"
          : unavailable
            ? "Couldn’t load balances"
            : [
                totals.usd !== null ? formatUsd(totals.usd) : prices ? null : "price unavailable",
                ...totals.tokens.map((t) => `${formatAmount(t.amount, t.decimals, 2)} ${t.symbol}`),
              ]
                .filter(Boolean)
                .join(" · ")}
      </p>
    </div>
  );
}

function StatusIcon({ status }: { status: ChainScanStatus }) {
  switch (status) {
    case "scanning":
      return <Loader2 className="size-4 animate-spin text-zinc-500" aria-label="Scanning" />;
    case "done":
      return <CheckCircle2 className="size-4 text-emerald-400/80" aria-label="Done" />;
    case "error":
      return <AlertTriangle className="size-4 text-amber-400" aria-label="Partially failed" />;
    default:
      return <CircleSlash className="size-4 text-zinc-600" aria-label={status} />;
  }
}

function ChainCard({
  chain,
  state,
  groups,
  totals,
  prices,
  hideEmpty,
}: {
  chain: ChainId;
  state: { status: ChainScanStatus; note?: string };
  groups: AddressGroup[];
  totals: Totals;
  prices: Prices | null;
  hideEmpty: boolean;
}) {
  const meta = CHAINS[chain];
  const change = prices?.change24h?.[chain];
  const visible = hideEmpty
    ? groups.filter((g) => g.status === "error" || g.addresses.some(isNotable))
    : groups;

  return (
    <article className="overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-950/70 backdrop-blur-xl">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:p-5">
        <ChainBadge chain={chain} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight">{meta.name}</h3>
            <StatusIcon status={state.status} />
          </div>
          <p className="text-xs text-zinc-500 tabular-nums">
            {prices ? (
              <>
                1 {meta.symbol} = {formatPrice(prices.usd[chain])}
                {typeof change === "number" ? (
                  <span className={change >= 0 ? "text-emerald-400/80" : "text-rose-400/80"}>
                    {" "}
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(1)}% 24h
                  </span>
                ) : null}
              </>
            ) : (
              meta.symbol
            )}
          </p>
        </div>
        {state.status !== "skipped" && !(state.status === "error" && totals.checked === 0) ? (
          <div className="text-right">
            <p className="font-mono text-base tabular-nums text-zinc-100">
              {formatAmount(totals.native, meta.decimals, meta.displayDecimals)}{" "}
              <span className="text-zinc-500">{meta.symbol}</span>
            </p>
            <p className="text-xs text-zinc-500 tabular-nums">
              {totals.usd !== null ? formatUsd(totals.usd) : "—"}
            </p>
          </div>
        ) : null}
      </header>

      {state.status === "skipped" ? (
        <p className="border-t border-white/[0.06] px-5 py-4 text-sm text-zinc-500">{state.note}</p>
      ) : (
        <div className="space-y-2 px-2 pb-2 sm:px-3 sm:pb-3">
          {state.status === "error" && state.note ? (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Some balances couldn’t be loaded ({state.note}). Try “Check again” in a moment.
              </span>
            </div>
          ) : null}

          {groups.length === 0 && state.status === "scanning" ? <GroupSkeleton /> : null}

          {visible.map((group) => (
            <GroupSection key={group.id} group={group} hideEmpty={hideEmpty} />
          ))}

          {hideEmpty && visible.length === 0 && state.status !== "scanning" ? (
            <p className="px-3 py-6 text-center text-sm text-zinc-500">
              No activity on the scanned {meta.name} paths.
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}

function GroupSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/[0.05] px-4 py-4">
          <div className="skeleton h-5 w-12 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-32 rounded" />
            <div className="skeleton h-3 w-56 max-w-full rounded" />
          </div>
          <div className="skeleton h-4 w-20 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Rows shown for an expanded group with no activity, before "Show all". */
const PREVIEW_ROWS = 5;

function GroupSection({ group, hideEmpty }: { group: AddressGroup; hideEmpty: boolean }) {
  const [toggled, setToggled] = useState<boolean | null>(null);
  const [showAll, setShowAll] = useState(false);
  const meta = CHAINS[group.chain];
  const totals = useMemo(() => sumEntries(group.addresses, group.chain, null), [group.addresses, group.chain]);
  const activeEntries = useMemo(() => group.addresses.filter(isActive), [group.addresses]);
  const failed = useMemo(() => group.addresses.filter((a) => a.status === "error").length, [group.addresses]);
  const expanded = toggled ?? (activeEntries.length > 0 || failed > 0);
  // Compact view: only addresses with activity (failures are summarised in one row).
  const compact = hideEmpty || activeEntries.length > 0 || failed > 0;
  const listAll = showAll && !hideEmpty;
  const entries = listAll
    ? group.addresses
    : compact
      ? activeEntries
      : group.addresses.slice(0, PREVIEW_ROWS);
  const hiddenRows = group.addresses.length - entries.length;
  const compactRows = compact ? activeEntries.length : Math.min(PREVIEW_ROWS, group.addresses.length);
  const canShowAll = !hideEmpty && compactRows < group.addresses.length;
  const first = group.addresses[0];
  const panelId = `group-${group.id}`;

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        totals.funded > 0 ? "border-emerald-400/20 bg-emerald-400/[0.025]" : "border-white/[0.06] bg-white/[0.015]"
      }`}
    >
      <button
        type="button"
        onClick={() => setToggled(!expanded)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/[0.02] sm:px-4"
      >
        <span className="hidden w-[4.75rem] shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-center font-mono text-[11px] text-zinc-400 sm:block">
          {group.badge}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-zinc-100">{group.title}</span>
            {totals.used > 0 ? (
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                {totals.used} active
              </span>
            ) : null}
            {group.status === "error" ? (
              <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                incomplete
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-zinc-500">
            <span className="font-mono">{group.path}</span>
            <span className="hidden sm:inline"> · {group.wallets}</span>
          </span>
        </span>
        <span className="hidden font-mono text-xs text-zinc-500 lg:block">
          {first ? shortenAddress(first.address, 7, 5) : null}
        </span>
        <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums sm:w-32">
          {group.status === "scanning" && totals.native === 0n ? (
            <Loader2 className="ml-auto size-4 animate-spin text-zinc-600" aria-label="Scanning" />
          ) : totals.checked === 0 && failed > 0 ? (
            <span className="text-zinc-600">—</span>
          ) : (
            <span className={totals.native > 0n ? "text-zinc-100" : "text-zinc-600"}>
              {formatAmount(totals.native, meta.decimals, meta.displayDecimals)}
            </span>
          )}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <ul id={panelId} className="divide-y divide-white/[0.04] border-t border-white/[0.05]">
          {entries.map((entry) => (
            <AddressRow key={entry.path} entry={entry} chain={group.chain} />
          ))}
          {failed > 0 && !listAll ? (
            <li className="flex items-start gap-2 px-4 py-3 text-xs text-amber-300/90">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              {failed} address{failed === 1 ? "" : "es"} couldn’t be checked
              {group.error ? ` (${group.error})` : ""}.
            </li>
          ) : null}
          {entries.length === 0 && failed === 0 ? (
            <li className="px-4 py-3 text-xs text-zinc-500">No activity on this path.</li>
          ) : null}
          {canShowAll ? (
            <li>
              <button
                type="button"
                onClick={() => setShowAll((s) => !s)}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-zinc-400 transition hover:bg-white/[0.02] hover:text-zinc-200"
              >
                {showAll
                  ? "Show fewer"
                  : `Show all ${group.addresses.length} addresses${
                      hiddenRows < group.addresses.length ? ` (${hiddenRows} more)` : ""
                    }`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

const AddressRow = memo(
  function AddressRow({ entry, chain }: { entry: AddressEntry; chain: ChainId }) {
    const meta = CHAINS[chain];
    const tokens = (entry.tokens ?? []).filter((t) => t.amount > 0n);
    const funded = (entry.balance ?? 0n) > 0n || tokens.length > 0;

    return (
      <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2.5 [grid-template-areas:'addr_bal'_'meta_act'] sm:grid-cols-[minmax(0,1fr)_5rem_9rem_auto] sm:px-4 sm:[grid-template-areas:'addr_activity_bal_act'_'meta_activity_bal_act']">
        <div className="flex min-w-0 items-center gap-1.5 [grid-area:addr]">
          <span className={`truncate font-mono text-xs sm:text-[13px] ${funded ? "text-white" : "text-zinc-300"}`}>
            <span className="hidden xl:inline">{entry.address}</span>
            <span className="xl:hidden">{shortenAddress(entry.address, 10, 8)}</span>
          </span>
          {entry.change ? (
            <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-px text-[10px] font-medium text-zinc-400">
              change
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-zinc-600 [grid-area:meta]">
          <span className="truncate">{entry.path}</span>
          <span className="shrink-0 font-sans sm:hidden">
            <Activity entry={entry} chain={chain} />
          </span>
        </div>

        <div className="hidden text-right text-xs text-zinc-500 [grid-area:activity] sm:block">
          <Activity entry={entry} chain={chain} />
        </div>

        <div className="text-right [grid-area:bal]">
          {entry.status === "pending" ? (
            <span className="skeleton ml-auto block h-3.5 w-16 rounded" />
          ) : entry.status === "error" ? (
            <span className="text-xs text-rose-300">Failed</span>
          ) : (
            <>
              <span className={`font-mono text-[13px] tabular-nums ${funded ? "text-white" : "text-zinc-600"}`}>
                {formatAmount(entry.balance ?? 0n, meta.decimals, meta.displayDecimals)}
              </span>
              {entry.pending ? (
                <span className="block text-[11px] text-amber-300/80 tabular-nums">
                  {entry.pending > 0n ? "+" : ""}
                  {formatAmount(entry.pending, meta.decimals, meta.displayDecimals)} pending
                </span>
              ) : null}
              {tokens.map((t) => (
                <span key={t.symbol} className="block font-mono text-[11px] text-emerald-300/90 tabular-nums">
                  {formatAmount(t.amount, t.decimals, 2)} {t.symbol}
                </span>
              ))}
            </>
          )}
        </div>

        <div className="-mr-1.5 flex items-center justify-end [grid-area:act]">
          <CopyButton value={entry.address} />
          <a
            href={EXPLORERS[chain](entry.address)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in block explorer"
            title="Open in block explorer"
            className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100"
          >
            <ArrowUpRight className="size-4" />
          </a>
        </div>
      </li>
    );
  },
  (a, b) =>
    a.chain === b.chain &&
    a.entry.address === b.entry.address &&
    a.entry.status === b.entry.status &&
    a.entry.balance === b.entry.balance &&
    a.entry.pending === b.entry.pending &&
    a.entry.txCount === b.entry.txCount &&
    a.entry.used === b.entry.used &&
    a.entry.tokens === b.entry.tokens,
);

function Activity({ entry, chain }: { entry: AddressEntry; chain: ChainId }) {
  if (entry.status !== "done") return null;
  if (chain === "sol") return entry.used ? <span className="text-emerald-400/80">active</span> : <>—</>;
  const n = entry.txCount ?? 0;
  if (n === 0) return <>{chain === "eth" && entry.used ? <span className="text-emerald-400/80">received</span> : "—"}</>;
  return (
    <span className="text-zinc-400" title={chain === "eth" ? "Transactions sent" : "Transactions"}>
      {n} tx{chain === "eth" ? " sent" : ""}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5 text-sm text-zinc-400 transition hover:text-zinc-200"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
          checked ? "bg-emerald-400/80" : "bg-white/10"
        }`}
      >
        <span
          className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
      {label}
    </button>
  );
}
