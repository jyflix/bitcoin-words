"use client";

import { Check, Copy, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { suggestWord } from "@/lib/mnemonic";
import { BIP39_WORDS, groupByLetter, searchWords } from "@/lib/wordlist";

const LETTERS = groupByLetter(BIP39_WORDS).map(([letter]) => letter);
const TOTAL = BIP39_WORDS.length.toLocaleString("en-US");

/** The full BIP39 English list, searchable, with the user's own words highlighted. */
export function WordList({ phraseWords }: { phraseWords: readonly string[] }) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);

  const term = deferredQuery.trim().toLowerCase();
  const numeric = /^\d+$/.test(term);
  const results = useMemo(() => searchWords(term), [term]);
  const groups = useMemo(() => groupByLetter(results), [results]);
  const available = useMemo(() => new Set(groups.map(([letter]) => letter)), [groups]);
  const suggestion = results.length === 0 && !numeric && term.length >= 3 ? suggestWord(term) : undefined;

  /** Word → its 1-based positions in the phrase on screen. */
  const positions = useMemo(() => {
    const map = new Map<string, number[]>();
    phraseWords.forEach((word, i) => map.set(word, [...(map.get(word) ?? []), i + 1]));
    return map;
  }, [phraseWords]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  function jumpTo(letter: string) {
    const list = listRef.current;
    const target = list?.querySelector<HTMLElement>(`[data-letter="${letter}"]`);
    if (list && target) list.scrollTo({ top: target.offsetTop, behavior: "smooth" });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(results.map((w) => w.word).join("\n"));
      setCopied(true);
    } catch {
      // Clipboard unavailable (e.g. insecure context).
    }
  }

  return (
    <section className="mt-16" aria-labelledby="wordlist-heading">
      <h2 id="wordlist-heading" className="text-xl font-semibold tracking-tight">
        BIP39 word list
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-400">
        All {TOTAL} words a recovery phrase can use. The first four letters of every word are unique, so “abou”
        can only mean “about”.
      </p>

      <div className="mt-5 overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-950/70 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] p-3 sm:p-4">
          <div className="relative w-full min-w-0 sm:w-auto sm:flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search words or numbers 1–2048"
              aria-label="Search the BIP39 word list"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10 w-full rounded-xl border border-white/10 bg-black/40 pr-9 pl-9 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/25 focus:ring-4 focus:ring-white/5 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-zinc-500 transition hover:text-zinc-200"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
          <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
            <span className="text-xs text-zinc-500 tabular-nums" aria-live="polite">
              {results.length === BIP39_WORDS.length ? `${TOTAL} words` : `${results.length} of ${TOTAL}`}
            </span>
            <button
              type="button"
              onClick={copy}
              disabled={results.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
            >
              {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : results.length === BIP39_WORDS.length ? "Copy all" : "Copy"}
            </button>
          </div>
        </div>

        <nav
          aria-label="Jump to letter"
          className="flex flex-wrap gap-0.5 border-b border-white/[0.06] px-2 py-2 sm:px-3"
        >
          {LETTERS.map((letter) => (
            <button
              key={letter}
              type="button"
              onClick={() => jumpTo(letter)}
              disabled={!available.has(letter)}
              className="size-7 rounded-md font-mono text-xs text-zinc-400 uppercase transition hover:bg-white/[0.06] hover:text-white disabled:pointer-events-none disabled:opacity-25"
            >
              {letter}
            </button>
          ))}
        </nav>

        <div ref={listRef} className="relative max-h-[30rem] overflow-y-auto overscroll-contain">
          {groups.map(([letter, words]) => (
            <div key={letter} data-letter={letter}>
              <h3 className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-white/[0.04] bg-zinc-950/95 px-4 py-1.5 font-mono text-xs font-semibold text-zinc-200 uppercase backdrop-blur">
                {letter}
                <span className="font-sans text-[11px] font-normal text-zinc-600 normal-case">{words.length}</span>
              </h3>
              <ol className="grid grid-cols-2 gap-1 p-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {words.map(({ word, number }) => {
                  const at = positions.get(word);
                  return (
                    <li
                      key={word}
                      title={at ? `Word ${at.join(", ")} of your phrase` : undefined}
                      className={`flex min-w-0 items-baseline gap-2 rounded-md px-2 py-1 font-mono text-[13px] ${
                        at ? "bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-400/25 ring-inset" : "text-zinc-300"
                      }`}
                    >
                      <span className="w-8 shrink-0 text-right text-[10px] text-zinc-600 tabular-nums">{number}</span>
                      <span className="truncate">
                        {term && !numeric ? (
                          <>
                            <span className="font-semibold text-white">{word.slice(0, term.length)}</span>
                            {word.slice(term.length)}
                          </>
                        ) : (
                          word
                        )}
                      </span>
                      {at ? (
                        <span className="ml-auto shrink-0 text-[10px] text-emerald-300/80">
                          {at.length > 2 ? `×${at.length}` : at.map((p) => `#${p}`).join(" ")}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}

          {results.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-zinc-500">
              {numeric ? `There is no word number ${term} — the list runs from 1 to 2048.` : `No BIP39 word starts with “${term}”.`}
              {suggestion ? (
                <>
                  {" "}
                  Did you mean{" "}
                  <button
                    type="button"
                    onClick={() => setQuery(suggestion)}
                    className="text-zinc-200 underline decoration-zinc-600 underline-offset-4 hover:decoration-zinc-300"
                  >
                    {suggestion}
                  </button>
                  ?
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <p className="border-t border-white/[0.06] px-4 py-3 text-xs leading-relaxed text-zinc-500">
          Numbers are positions 1–2048, the line numbers of the official list; backups that count from 0 are one
          lower.
          {positions.size > 0 ? (
            <>
              {" "}
              Words from your phrase are <span className="text-emerald-300">highlighted</span>.
            </>
          ) : null}
        </p>
      </div>
    </section>
  );
}
