/** Formats a base-unit integer as a decimal string with thousands separators. */
export function formatUnits(value: bigint, decimals: number, maxFraction = decimals): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  let whole = abs / base;
  let fraction = abs % base;
  let digits = decimals;

  if (maxFraction < decimals) {
    const drop = 10n ** BigInt(decimals - maxFraction);
    fraction = (fraction + drop / 2n) / drop;
    digits = maxFraction;
    if (fraction >= 10n ** BigInt(maxFraction)) {
      whole += 1n;
      fraction = 0n;
    }
  }

  const fractionText = digits > 0 ? fraction.toString().padStart(digits, "0").replace(/0+$/, "") : "";
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${wholeText}${fractionText ? `.${fractionText}` : ""}`;
}

/** Like formatUnits, but shows "<0.000001" instead of rounding dust to zero. */
export function formatAmount(value: bigint, decimals: number, maxFraction: number): string {
  const text = formatUnits(value, decimals, maxFraction);
  if (value > 0n && /^0(\.0*)?$/.test(text)) {
    return maxFraction > 0 ? `<0.${"0".repeat(maxFraction - 1)}1` : "<1";
  }
  return text;
}

export function toNumber(value: bigint, decimals: number): number {
  return Number(value) / 10 ** decimals;
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return "<$0.01";
  return usd.format(value);
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function shortenAddress(address: string, head = 8, tail = 6): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}
