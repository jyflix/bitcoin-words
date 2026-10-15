"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  Eye,
  EyeOff,
  Info,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { applySuggestions, type PhraseAnalysis } from "@/lib/mnemonic";

interface PhraseInputProps {
  value: string;
  onChange: (value: string) => void;
  analysis: PhraseAnalysis;
  concealed: boolean;
  onToggleConcealed: () => void;
  onClear: () => void;
  onSubmit: () => void;
  onDemo: () => void;
}

/** Attributes that keep spellcheckers, autofill and password managers out of the phrase. */
const PRIVATE_FIELD = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

export function PhraseInput({
  value,
  onChange,
  analysis,
  concealed,
  onToggleConcealed,
  onClear,
  onSubmit,
  onDemo,
}: PhraseInputProps) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pasteFailed, setPasteFailed] = useState(false);
  const unknown = new Map(analysis.unknown.map((u) => [u.index, u]));
  const typingIndex = analysis.status === "typing" ? analysis.words.length - 1 : -1;

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) onChange(text);
      setPasteFailed(false);
    } catch {
      setPasteFailed(true);
      textareaRef.current?.focus();
    }
  }

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-zinc-200">
          Recovery phrase
        </label>
        <div className="flex items-center gap-1">
          <ToolbarButton onClick={paste} label="Paste" icon={<ClipboardPaste className="size-3.5" />} />
          <ToolbarButton
            onClick={onToggleConcealed}
            label={concealed ? "Show" : "Hide"}
            pressed={concealed}
            icon={concealed ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          />
          <ToolbarButton
            onClick={onClear}
            label="Clear"
            disabled={!value}
            icon={<X className="size-3.5" />}
          />
        </div>
      </div>

      <div className="relative">
        <textarea
          id={id}
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
          rows={4}
          placeholder="Paste or type your 12 or 24 words, separated by spaces…"
          aria-describedby={`${id}-status`}
          aria-invalid={["unknown-words", "bad-checksum", "wrong-length"].includes(analysis.status)}
          className={`block w-full resize-none rounded-2xl border bg-black/40 px-4 py-3.5 font-mono text-[15px] leading-7 shadow-inner shadow-black/40 outline-none transition placeholder:text-zinc-600 focus:ring-4 ${
            analysis.status === "valid"
              ? "border-emerald-400/30 focus:border-emerald-400/50 focus:ring-emerald-400/10"
              : "border-white/10 focus:border-white/25 focus:ring-white/5"
          } ${concealed ? "text-transparent selection:bg-transparent" : "text-zinc-100"}`}
          {...PRIVATE_FIELD}
        />
        {concealed && value ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-950/80 text-sm text-zinc-400">
            <EyeOff className="size-5 text-zinc-500" aria-hidden="true" />
            <span>
              Phrase hidden · {analysis.words.length} word{analysis.words.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={onToggleConcealed}
              className="rounded-lg border border-white/10 px-3 py-1 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.06]"
            >
              Show
            </button>
          </div>
        ) : null}
      </div>

      <div id={`${id}-status`} className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" aria-live="polite">
        <PhraseStatusLine analysis={analysis} onFix={() => onChange(applySuggestions(analysis) ?? value)} />
        {analysis.status === "empty" ? (
          <button
            type="button"
            onClick={onDemo}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-4 transition hover:text-zinc-200 hover:decoration-zinc-400"
          >
            <Sparkles className="size-3.5" />
            Try the public demo phrase
          </button>
        ) : null}
      </div>
      {pasteFailed ? (
        <p className="mt-2 text-xs text-zinc-500">
          Clipboard access was blocked — press <kbd className="font-mono">Ctrl</kbd>/<kbd className="font-mono">⌘</kbd>+
          <kbd className="font-mono">V</kbd> in the box instead.
        </p>
      ) : null}

      {analysis.words.length > 0 ? (
        <ol className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6" aria-label="Parsed words">
          {analysis.words.map((word, i) => {
            const issue = unknown.get(i);
            const tone = issue
              ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
              : i === typingIndex
                ? "border-dashed border-white/15 text-zinc-400"
                : "border-white/[0.06] bg-white/[0.025] text-zinc-200";
            return (
              <li
                key={i}
                title={issue?.suggestion ? `Did you mean “${issue.suggestion}”?` : undefined}
                className={`flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 font-mono text-[13px] ${tone}`}
              >
                <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-zinc-500">{i + 1}</span>
                <span className="truncate">{concealed ? "••••••" : word}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

function ToolbarButton({
  onClick,
  label,
  icon,
  pressed,
  disabled,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function PhraseStatusLine({ analysis, onFix }: { analysis: PhraseAnalysis; onFix: () => void }) {
  const n = analysis.words.length;
  const words = `${n} word${n === 1 ? "" : "s"}`;

  switch (analysis.status) {
    case "empty":
      return (
        <Line tone="muted" icon={<Info className="size-4" />}>
          12–24 words. Numbered lists, commas and line breaks are fine.
        </Line>
      );
    case "typing":
      return (
        <Line tone="muted" icon={<Info className="size-4" />}>
          {n - 1 > 0 ? `${n - 1} word${n - 1 === 1 ? "" : "s"} so far…` : "Keep typing…"}
        </Line>
      );
    case "unknown-words": {
      const [first] = analysis.unknown;
      const canFix = analysis.unknown.every((u) => u.suggestion);
      return (
        <Line tone="error" icon={<AlertTriangle className="size-4" />}>
          {analysis.unknown.length === 1 ? (
            <>
              Word {first.index + 1} “{first.word}” isn’t in the BIP39 list
              {first.suggestion ? <> — did you mean “{first.suggestion}”?</> : "."}
            </>
          ) : (
            <>{analysis.unknown.length} words aren’t in the BIP39 list.</>
          )}
          {canFix ? (
            <button
              type="button"
              onClick={onFix}
              className="ml-2 inline-flex items-center gap-1 rounded-md bg-rose-400/15 px-2 py-0.5 text-xs font-medium text-rose-100 transition hover:bg-rose-400/25"
            >
              <Wand2 className="size-3" />
              Fix {analysis.unknown.length === 1 ? "it" : "all"}
            </button>
          ) : null}
        </Line>
      );
    }
    case "wrong-length":
      return (
        <Line tone="warn" icon={<AlertTriangle className="size-4" />}>
          {words} — recovery phrases have 12, 15, 18, 21 or 24 words.
        </Line>
      );
    case "bad-checksum":
      return (
        <Line tone="error" icon={<AlertTriangle className="size-4" />}>
          {words}, but the checksum doesn’t match — a word may be wrong or out of order.
        </Line>
      );
    case "unsupported":
      return (
        <Line tone="warn" icon={<AlertTriangle className="size-4" />}>
          This is an Electrum 2FA seed (2-of-3 multisig), which isn’t supported.
        </Line>
      );
    case "valid":
      return (
        <Line tone="ok" icon={<CheckCircle2 className="size-4" />}>
          {analysis.bip39 ? (
            <>
              Valid BIP39 phrase · {words}
              {analysis.electrum === "standard" || analysis.electrum === "segwit" ? (
                <span className="text-emerald-300/60"> · also matches the Electrum format</span>
              ) : null}
            </>
          ) : (
            <>
              Electrum {analysis.electrum === "segwit" ? "SegWit" : "standard"} seed · {words} ·{" "}
              <span className="text-emerald-300/60">Bitcoin only</span>
            </>
          )}
        </Line>
      );
  }
}

const TONES = {
  muted: "text-zinc-500",
  ok: "text-emerald-300",
  warn: "text-amber-300",
  error: "text-rose-300",
};

function Line({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className={`flex min-w-0 items-start gap-2 text-sm ${TONES[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
