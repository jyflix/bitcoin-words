"use client";

import { ArrowRight, Loader2, Lock } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { analyzePhrase } from "@/lib/mnemonic";
import type { ChainId } from "@/lib/types";
import { PhraseInput } from "./phrase-input";
import { Results } from "./results";
import { ScanOptions } from "./scan-options";
import { useScanner } from "./use-scanner";
import { WordList } from "./word-list";

const NO_WORDS: readonly string[] = [];

/** The public BIP39 test vector — a well-known, watched wallet. Never fund it. */
const DEMO_PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

export function SeedChecker() {
  const [phrase, setPhrase] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [count, setCount] = useState(10);
  const [chains, setChains] = useState<Record<ChainId, boolean>>({ btc: true, eth: true, sol: true });
  const [concealed, setConcealed] = useState(false);
  const { snapshot, start, stop, reset } = useScanner();

  const deferredPhrase = useDeferredValue(phrase);
  const analysis = useMemo(() => analyzePhrase(deferredPhrase), [deferredPhrase]);
  const running = snapshot?.status === "running";
  const anyChain = chains.btc || chains.eth || chains.sol;
  const ready = analysis.status === "valid" && anyChain && deferredPhrase === phrase;

  // Fetch the derivation + network bundle while the user reviews the phrase.
  useEffect(() => {
    if (analysis.status === "valid") void import("@/lib/scanner");
  }, [analysis.status]);

  function scan() {
    if (!ready) return;
    void start({
      mnemonic: analysis.mnemonic,
      passphrase,
      bip39: analysis.bip39,
      electrum: analysis.electrum === "standard" || analysis.electrum === "segwit" ? analysis.electrum : null,
      count,
      chains,
    });
    requestAnimationFrame(() =>
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  // Results always belong to the phrase on screen: editing it discards them.
  function updatePhrase(value: string) {
    if (snapshot) reset();
    setPhrase(value);
  }

  function updatePassphrase(value: string) {
    if (snapshot) reset();
    setPassphrase(value);
  }

  function clearAll() {
    reset();
    setPhrase("");
    setPassphrase("");
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          scan();
        }}
        className="relative rounded-3xl border border-white/[0.08] bg-zinc-950/70 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-6"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 -top-px h-px bg-linear-to-r from-transparent via-white/30 to-transparent"
        />
        <PhraseInput
          value={phrase}
          onChange={updatePhrase}
          analysis={analysis}
          concealed={concealed}
          onToggleConcealed={() => setConcealed((c) => !c)}
          onClear={clearAll}
          onSubmit={scan}
          onDemo={() => updatePhrase(DEMO_PHRASE)}
        />

        <div className="mt-5">
          <ScanOptions
            passphrase={passphrase}
            onPassphraseChange={updatePassphrase}
            count={count}
            onCountChange={setCount}
            chains={chains}
            onChainsChange={setChains}
          />
        </div>

        <button
          type="submit"
          disabled={!ready || running}
          className="group mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-semibold text-zinc-950 shadow-[0_0_0_1px_rgb(255_255_255/0.1),0_8px_30px_-6px_rgb(255_255_255/0.25)] transition hover:bg-zinc-100 active:scale-[0.995] disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500 disabled:shadow-none"
        >
          {running ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Checking balances…
            </>
          ) : (
            <>
              {snapshot ? "Check again" : "Check balances"}
              <ArrowRight className="size-4 transition-transform group-enabled:group-hover:translate-x-0.5" />
            </>
          )}
        </button>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-500">
          <Lock className="size-3" aria-hidden="true" />
          Keys are derived on this device. Only public addresses are looked up.
          <span className="hidden sm:inline">
            {" "}
            <kbd className="rounded border border-white/10 px-1 font-sans text-[10px] text-zinc-400">Ctrl</kbd> +{" "}
            <kbd className="rounded border border-white/10 px-1 font-sans text-[10px] text-zinc-400">Enter</kbd>
          </span>
        </p>
      </form>

      {snapshot ? <Results snapshot={snapshot} onRescan={scan} onStop={stop} /> : null}

      {/* Highlights stay off while the phrase is hidden. */}
      <WordList phraseWords={concealed ? NO_WORDS : analysis.words} />
    </>
  );
}
