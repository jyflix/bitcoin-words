# SeedScope

Paste a 12 or 24-word recovery phrase and see the Bitcoin, Ethereum and Solana addresses it controls — across
the derivation paths popular wallets use — together with their live balances.

Built with Next.js 16, React 19 and Tailwind CSS 4. Keys are derived **in the browser** with the audited
[noble](https://paulmillr.com/noble/) / [scure](https://github.com/paulmillr/scure-bip32) libraries; the
recovery phrase never leaves the device.

## Features

- **Live phrase validation** — word-by-word BIP39 checks, checksum validation, typo suggestions with one-click
  fixes, and tolerant parsing of numbered lists, commas and line breaks. 12, 15, 18, 21 and 24 words.
- **Every common derivation path**

  | Chain    | Paths                                                                                                   |
  | -------- | ------------------------------------------------------------------------------------------------------- |
  | Bitcoin  | Native SegWit `m/84'`, Taproot `m/86'`, Nested SegWit `m/49'`, Legacy `m/44'` — receive **and** change addresses, gap-limit scanning and automatic discovery of further accounts. Electrum native seeds (standard & SegWit) too. |
  | Ethereum | Standard `m/44'/60'/0'/0/i` (MetaMask, Trust, Rabby…), Ledger Live `m/44'/60'/i'/0/0`, legacy Ledger `m/44'/60'/0'/i` |
  | Solana   | `m/44'/501'/i'/0'` (Phantom, Solflare, Backpack), `m/44'/501'/i'` (Ledger, Trust Wallet), Solana CLI (no path) |
- **Balances** — BTC (incl. unconfirmed), ETH + USDT + USDC, SOL + USDC + USDT, valued in USD.
- **Optional BIP39 passphrase** (“25th word”) and adjustable scan depth.
- **Fast** — the page is statically prerendered; crypto code loads on demand; lookups are batched
  (JSON-RPC batches for Ethereum, `getMultipleAccounts` for Solana) and run in parallel.
- **Resilient** — every network has fallback providers with retries, cooldowns for failing hosts and
  round-robin load spreading for Bitcoin; failures are reported per path instead of silently showing zero.

## Security model

- The phrase and passphrase are processed only in the browser. Right after derivation the seed and private keys
  are wiped from memory and only public keys (xpubs) and addresses are kept. Private keys are never displayed.
- Only **public addresses** are sent over the network, to the providers in
  [`src/lib/endpoints.ts`](src/lib/endpoints.ts). A strict Content-Security-Policy (built from that same list in
  [`next.config.ts`](next.config.ts)) makes the browser refuse to send data anywhere else.
- No cookies, storage, analytics or server-side code. The input opts out of spellcheck, autofill, Grammarly
  and password managers. Requests are sent without credentials or referrer.
- Providers can still see which addresses were looked up together (and your IP). Point the app at your own
  nodes (below) if that matters to you.

> [!WARNING]
> Anyone with a recovery phrase can take the funds. Only enter phrases into a copy of this app you control —
> ideally run it locally. Public deployments of seed-phrase tools are often flagged as phishing by browser
> safe-browsing lists, so the site ships with `noindex`.

## Getting started

Requires Node.js 20.9+.

```bash
npm install
npm run dev      # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

Click **“Try the public demo phrase”** to see it work with the well-known BIP39 test vector
(`abandon … about`) — a public wallet that anyone can access, so never send funds to it.

## Configuration

All endpoints are optional overrides — comma-separated lists, tried in order (Bitcoin requests are spread
round-robin). They are added to the CSP automatically; rebuild after changing them. See
[`.env.example`](.env.example).

| Variable              | Default                                                     |
| --------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_BTC_API` | `https://mempool.space/api`, `https://blockstream.info/api` (Esplora API) |
| `NEXT_PUBLIC_ETH_RPC` | PublicNode, LlamaRPC, 1RPC                                  |
| `NEXT_PUBLIC_SOL_RPC` | PublicNode, `api.mainnet-beta.solana.com`                   |

`NEXT_PUBLIC_*` values are visible in the browser — use domain-restricted API keys (e.g. Alchemy, Helius).
Prices come from CoinGecko with Coinbase as fallback; stablecoins are valued at $1.

## Deploying

The app is fully static, so any Next.js host works. On Vercel: import the repository and deploy — no settings
needed. Security headers are set in `next.config.ts`.

## Development

```bash
npm test          # vitest: derivation vectors, parsing, scanner logic, network fallbacks
npm run lint
npm run typecheck
```

Derivation tests use reference vectors cross-checked against bitcoinjs-lib, ethers, `@solana/web3.js` +
`@solana/spl-token` and `ed25519-hd-key`, plus the official BIP84/BIP86, SLIP-0010 and Electrum test vectors.

```
src/
  app/                 page, layout, global styles
  components/          UI (client components) and icons
  lib/
    mnemonic.ts        parsing, validation, typo suggestions
    electrum.ts        Electrum seed detection
    derive/            BTC / ETH / SOL key derivation (public material only)
    chains/            balance clients: Esplora, Ethereum JSON-RPC, Solana RPC, prices
    scanner.ts         orchestration: gap-limit scanning, account discovery, progress updates
    net.ts             fetch with timeouts, retries, provider failover, batching
    endpoints.ts       provider lists (also feeds the CSP)
```

## Limitations

- Mainnets only. Only native coins plus USDT/USDC are shown — other tokens, NFTs and L2s are not (your EVM
  address is the same on every EVM chain, so you can check it in their explorers).
- English BIP39 wordlist only. Electrum 2FA seeds and pre-2.0 Electrum seeds are not supported.
- Public APIs rate-limit heavy use; if lookups fail, wait a moment and use “Check again”, or configure your
  own endpoints.
