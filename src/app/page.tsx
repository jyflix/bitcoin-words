import { Cpu, EyeOff, Network, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ChainBadge, Logo } from "@/components/chain-icons";
import { SeedChecker } from "@/components/seed-checker";
import { browserEndpoints, providerNames, type Chain } from "@/config/providers";

const CHAIN_NAMES: Record<Chain, string> = { btc: "Bitcoin", eth: "Ethereum", sol: "Solana" };
const PUBLIC_PROVIDERS: Record<Chain, string> = {
  btc: "mempool.space or Blockstream",
  eth: "PublicNode, LlamaRPC or 1RPC",
  sol: "PublicNode or Solana’s public RPC",
};

export default function Home() {
  // Read at build time; only proxy routes or public URLs reach the browser, never keys.
  const endpoints = browserEndpoints(process.env);
  const names = providerNames(process.env);
  const chains = Object.keys(CHAIN_NAMES) as Chain[];
  const either = new Intl.ListFormat("en", { type: "disjunction" });
  const routes = chains.map((chain) =>
    names[chain].length > 0
      ? `${CHAIN_NAMES[chain]} via this site’s server to ${either.format(names[chain])}`
      : `${CHAIN_NAMES[chain]} directly to ${PUBLIC_PROVIDERS[chain]}`,
  );
  const usesPrivateProviders = chains.some((chain) => names[chain].length > 0);

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-clip">
      <Backdrop />

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <Logo className="size-8" />
          <span className="text-[17px]">SeedScope</span>
        </Link>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-xs font-medium text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400" />
          <span className="hidden sm:inline">Runs locally in your browser</span>
          <span className="sm:hidden">Local only</span>
        </span>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
        <section className="pt-8 pb-10 text-center sm:pt-14 sm:pb-12">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-zinc-400">
            <ShieldCheck className="size-3.5 text-emerald-400" aria-hidden="true" />
            Your phrase never leaves this device
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            One seed phrase.{" "}
            <span className="bg-linear-to-r from-btc via-[#c58cff] to-sol bg-clip-text text-transparent">
              Every balance.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-balance text-zinc-400 sm:text-lg">
            Paste a 12 or 24-word recovery phrase to find its Bitcoin, Ethereum and Solana addresses across the
            derivation paths popular wallets use — and see what they hold.
          </p>
          <ul className="mt-7 flex flex-wrap justify-center gap-2 text-sm text-zinc-300">
            {(
              [
                ["btc", "Bitcoin", "4 address types"],
                ["eth", "Ethereum", "ETH · USDT · USDC"],
                ["sol", "Solana", "SOL · USDC · USDT"],
              ] as const
            ).map(([chain, name, detail]) => (
              <li
                key={chain}
                className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] py-1 pr-3.5 pl-1"
              >
                <ChainBadge chain={chain} size="sm" />
                {name}
                <span className="text-zinc-500">{detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <SeedChecker endpoints={endpoints} />

        <section className="mt-16 grid gap-3 sm:grid-cols-3" aria-label="How it works">
          <Feature icon={<Cpu className="size-4" />} title="Derived locally">
            Keys are computed in your browser with the audited noble &amp; scure libraries. Only public
            addresses are kept — the seed and private keys are wiped right after.
          </Feature>
          <Feature icon={<Network className="size-4" />} title="Read-only lookups">
            Only public addresses are looked up — never your phrase or keys. A strict Content-Security-Policy
            blocks every destination the app doesn’t use.
          </Feature>
          <Feature icon={<EyeOff className="size-4" />} title="Nothing stored">
            No accounts, cookies, analytics or storage. Private keys are never displayed. Close the tab and
            it’s gone.
          </Feature>
        </section>

        <aside className="mt-3 flex gap-3 rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4 text-sm leading-relaxed text-amber-100/80">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden="true" />
          <p>
            Never paste a recovery phrase into a website you don’t control — anyone with these words can take
            the funds. SeedScope is open source: for wallets holding real money, run it yourself on a trusted
            computer, and move funds to a fresh wallet if a phrase may have been exposed.
          </p>
        </aside>

        <section className="mt-16 mb-20" aria-labelledby="faq">
          <h2 id="faq" className="text-xl font-semibold tracking-tight">
            Questions
          </h2>
          <div className="mt-5 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-white/[0.015]">
            <Faq q="Which wallets are covered?">
              Bitcoin: Native SegWit (BIP84), Taproot (BIP86), Nested SegWit (BIP49) and Legacy (BIP44), with
              receive and change addresses and automatic discovery of further accounts — plus Electrum’s own seed
              format. Ethereum: the standard MetaMask/Trust/Rabby path, Ledger Live accounts and the legacy Ledger
              path. Solana: Phantom/Solflare/Backpack, Ledger/Trust Wallet and the Solana CLI.
            </Faq>
            <Faq q="Why don’t I see my balance?">
              The wallet may use a BIP39 passphrase (the “25th word”), or funds may sit beyond the scan depth —
              both are in Advanced options. Only ETH/USDT/USDC on Ethereum mainnet and SOL/USDC/USDT on Solana
              are shown; other tokens, NFTs and networks aren’t. Your Ethereum address works on every EVM chain,
              so you can paste it into an explorer for Base, Arbitrum or BNB Chain.
            </Faq>
            <Faq q="What exactly is sent over the network?">
              Only derived public addresses — {routes.join("; ")}.
              {usesPrivateProviders ? " API keys are added on the server and never reach your browser." : ""} Prices
              come from CoinGecko or Coinbase. Providers can see which addresses were looked up together.
            </Faq>
            <Faq q="Can this move my funds?">
              No. SeedScope is read-only: it never shows private keys, signs anything or connects to a wallet.
            </Faq>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-2">
            <Logo className="size-4" />
            SeedScope · read-only · open source
          </span>
          <span>Balances from blockchain explorers &amp; RPC providers · prices from CoinGecko</span>
        </div>
      </footer>
    </div>
  );
}

function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,black,transparent)]" />
      <div className="absolute -top-40 left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(247_147_26/0.16),transparent)] blur-2xl" />
      <div className="absolute top-10 -left-40 h-[28rem] w-[36rem] rounded-full bg-[radial-gradient(closest-side,rgb(98_126_234/0.14),transparent)] blur-2xl" />
      <div className="absolute top-24 -right-40 h-[28rem] w-[36rem] rounded-full bg-[radial-gradient(closest-side,rgb(153_69_255/0.16),transparent)] blur-2xl" />
    </div>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-white/[0.06] text-zinc-200">
          {icon}
        </span>
        <h3 className="font-medium text-zinc-100">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">{children}</p>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group px-5 py-4">
      <summary className="flex cursor-pointer items-center justify-between gap-4 text-[15px] font-medium text-zinc-200">
        {q}
        <span className="text-xl leading-none font-light text-zinc-500 transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">{children}</p>
    </details>
  );
}
