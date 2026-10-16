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
- **“I’m feeling lucky”** — fills in a random valid 12 or 24-word phrase from the browser’s secure random
  generator. It is a brand-new wallet: with 2^128 possible phrases, it is practically certain to be empty.
- **BIP39 word list** — all 2,048 words, searchable by prefix or by number (1–2048), with A–Z jump links,
  copy, and the words of your phrase highlighted.
- **Fast** — the page is statically prerendered; crypto code loads on demand; lookups are batched
  (JSON-RPC batches for Ethereum, `getMultipleAccounts` for Solana) and run in parallel.
- **Resilient** — every network has fallback providers with retries, cooldowns for failing hosts and
  round-robin load spreading for Bitcoin; failures are reported per path instead of silently showing zero.
- **Private RPC providers** — plug in Alchemy, Infura, Helius, QuickNode, your own node and more with
  environment variables; API keys stay on the server.

## Security model

- The phrase and passphrase are processed only in the browser. Right after derivation the seed and private keys
  are wiped from memory and only public keys (xpubs) and addresses are kept. Private keys are never displayed.
- Only **public addresses** are sent over the network — to public endpoints, or to this app's own `/api` routes
  for chains with a [private provider](#private-rpc-providers). A strict Content-Security-Policy built from
  [`src/config/providers.ts`](src/config/providers.ts) makes the browser refuse to send data anywhere else.
- No cookies, storage or analytics. The input opts out of spellcheck, autofill, Grammarly and password managers.
  Requests are sent without credentials or referrer.
- Providers can still see which addresses were looked up together (and, for public endpoints, your IP). Use
  private providers or your own nodes if that matters to you.

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

## Private RPC providers

Nothing is required: without configuration every lookup goes from the browser to free public endpoints
(mempool.space / Blockstream, PublicNode / LlamaRPC / 1RPC, PublicNode / Solana public RPC).

To use your own providers, copy [`.env.example`](.env.example) to `.env.local` and set any of:

| Variable                | Chain    | Value                                                                       |
| ----------------------- | -------- | --------------------------------------------------------------------------- |
| `ALCHEMY_API_KEY`       | ETH, SOL | Alchemy app API key                                                         |
| `INFURA_API_KEY`        | ETH      | Infura API key                                                              |
| `HELIUS_API_KEY`        | SOL      | Helius API key                                                              |
| `ETH_RPC_URLS`          | ETH      | Other JSON-RPC URLs (QuickNode, Chainstack, Ankr, own node), comma-separated |
| `SOL_RPC_URLS`          | SOL      | Other JSON-RPC URLs (QuickNode, Triton, own node), comma-separated           |
| `BTC_ESPLORA_URLS`      | BTC      | Esplora API base URLs, e.g. your own mempool on Umbrel / Start9              |
| `BTC_BLOCKBOOK_URLS`    | BTC      | Blockbook API base URLs ending in `/api/v2` (NOWNodes, GetBlock, own Blockbook) |
| `BTC_BLOCKBOOK_API_KEY` | BTC      | Optional, sent as the `api-key` header                                      |
| `PUBLIC_FALLBACK`       | all      | `false` to never fall back to public endpoints (default `true`)            |
| `API_RATE_LIMIT`        | all      | Requests per minute per IP for the `/api` routes (default `600`, `0` = off) |

How it works:

- For each chain with a private provider, the browser calls this app's route (`/api/rpc/eth`, `/api/rpc/sol`,
  `/api/btc/address/:address`) instead of public endpoints. The route adds the key on the server and forwards
  the request, trying providers in order, then public endpoints as a fallback.
- Keys never reach the browser: they are read only on the server (don't prefix them with `NEXT_PUBLIC_`).
- The routes forward only the exact lookups the app makes — balance, nonce and USDT/USDC `balanceOf` on
  Ethereum, `getMultipleAccounts` on Solana, address stats on Bitcoin — rebuilt from validated input, so nobody
  can spend your quota on other calls. They also reject cross-site browser requests and rate-limit per IP.
- Provider URL templates, public defaults and env var names are in
  [`src/config/providers.ts`](src/config/providers.ts) — add a provider there.

Env vars are read when the app starts or is built: restart `npm run dev` or rebuild after changing them.
Prices come from CoinGecko with Coinbase as fallback; stablecoins are valued at $1.

## Deploying

Any Next.js host works. The page itself is static; the `/api` routes run as server functions and are only
used when private providers are configured. On Vercel: import the repository, add your keys under
**Settings → Environment Variables**, and deploy. Security headers are set in `next.config.ts`.

## Development

```bash
npm test          # vitest: derivation vectors, parsing, scanner logic, network fallbacks, proxy rules
npm run lint
npm run typecheck
```

Derivation tests use reference vectors cross-checked against bitcoinjs-lib, ethers, `@solana/web3.js` +
`@solana/spl-token` and `ed25519-hd-key`, plus the official BIP84/BIP86, SLIP-0010 and Electrum test vectors.

```
src/
  app/                 page, layout, global styles
    api/               proxy routes for private providers (eth, sol, btc)
  components/          UI (client components) and icons
  config/
    providers.ts       provider constants: env vars, URL templates, public endpoints, CSP origins
  lib/
    mnemonic.ts        parsing, validation, typo suggestions, random phrases
    electrum.ts        Electrum seed detection
    wordlist.ts        BIP39 word list search
    derive/            BTC / ETH / SOL key derivation (public material only)
    chains/            balance clients: Esplora, Ethereum JSON-RPC, Solana RPC, prices
    scanner.ts         orchestration: gap-limit scanning, account discovery, progress updates
    net.ts             fetch with timeouts, retries, provider failover, batching
    proxy/             request validation, upstream forwarding, rate limiting for the /api routes
    server/            server-only: provider pools built from env vars
```

## Limitations

- Mainnets only. Only native coins plus USDT/USDC are shown — other tokens, NFTs and L2s are not (your EVM
  address is the same on every EVM chain, so you can check it in their explorers).
- English BIP39 wordlist only. Electrum 2FA seeds and pre-2.0 Electrum seeds are not supported.
- Public APIs rate-limit heavy use; if lookups fail, wait a moment and use “Check again”, or configure your
  own endpoints.
