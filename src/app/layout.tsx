import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { GradientDefs } from "@/components/chain-icons";
import "./globals.css";

export const metadata: Metadata = {
  title: "SeedScope — Seed phrase balance checker for Bitcoin, Ethereum & Solana",
  description:
    "Paste a 12 or 24-word recovery phrase to derive Bitcoin, Ethereum and Solana addresses across common wallet paths and check their balances. Keys are derived locally in your browser.",
  // A tool that asks for recovery phrases should not be advertised in search results.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: "#06070a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-ink font-sans text-zinc-100" suppressHydrationWarning>
        <GradientDefs />
        {children}
      </body>
    </html>
  );
}
