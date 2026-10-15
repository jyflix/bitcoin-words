import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { describe, expect, it } from "vitest";
import { electrumSeedType } from "@/lib/electrum";
import { BIP_SCHEMES, deriveBipAccounts } from "./bitcoin";
import { deriveEthGroups, toChecksumAddress } from "./ethereum";
import { deriveMaterial } from "./index";
import { associatedTokenAddress, deriveSolGroups, slip10DerivePath, slip10Master } from "./solana";

// Reference values were cross-checked against bitcoinjs-lib, ethers,
// @solana/web3.js + @solana/spl-token and ed25519-hd-key, plus the BIP84/86,
// SLIP-0010 and Electrum test vectors.
const ABANDON = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const seed = mnemonicToSeedSync(ABANDON);
const root = () => HDKey.fromMasterSeed(seed);
const scheme = (id: string) => BIP_SCHEMES.find((s) => s.id === id)!;
const all = { btc: true, eth: true, sol: true };

describe("bitcoin", () => {
  it.each([
    ["bip84", 0, 0, 0, "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"],
    ["bip84", 0, 0, 1, "bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g"],
    ["bip84", 0, 1, 0, "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el"],
    ["bip84", 1, 0, 0, "bc1qku0qh0mc00y8tk0n65x2tqw4trlspak0fnjmfz"],
    ["bip86", 0, 0, 0, "bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr"],
    ["bip86", 0, 0, 1, "bc1p4qhjn9zdvkux4e44uhx8tc55attvtyu358kutcqkudyccelu0was9fqzwh"],
    ["bip86", 0, 1, 0, "bc1p3qkhfews2uk44qtvauqyr2ttdsw7svhkl9nkm9s9c3x4ax5h60wqwruhk7"],
    ["bip49", 0, 0, 0, "37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf"],
    ["bip49", 0, 1, 0, "34K56kSjgUCUSD8GTtuF7c9Zzwokbs6uZ7"],
    ["bip44", 0, 0, 0, "1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA"],
    ["bip44", 0, 1, 0, "1J3J6EvPrv8q6AC3VCjWV45Uf3nssNMRtH"],
  ] as const)("%s account %i chain %i index %i", (id, account, change, index, expected) => {
    const accounts = deriveBipAccounts(root(), scheme(id), 2);
    const derived = accounts[account].address(change, index);
    expect(derived.address).toBe(expected);
    expect(derived.path).toBe(`m/${scheme(id).purpose}'/0'/${account}'/${change}/${index}`);
  });

  it("detects and derives Electrum standard seeds", async () => {
    const phrase = "cycle rocket west magnet parrot shuffle foot correct salt library feed song";
    expect(electrumSeedType(phrase)).toBe("standard");
    const material = await deriveMaterial({
      mnemonic: phrase,
      passphrase: "",
      bip39: false,
      electrum: "standard",
      count: 1,
      chains: all,
    });
    expect(material.eth).toHaveLength(0);
    expect(material.sol).toHaveLength(0);
    const [account] = material.btc[0];
    expect(account.address(0, 0).address).toBe("1NNkttn1YvVGdqBW4PR6zvc3Zx3H5owKRf");
    expect(account.address(1, 0).address).toBe("1KSezYMhAJMWqFbVFB2JshYg69UpmEXR4D");
    expect(account.address(0, 0).path).toBe("m/0/0");
  });

  it("detects and derives Electrum segwit seeds", async () => {
    const phrase = "bitter grass shiver impose acquire brush forget axis eager alone wine silver";
    expect(electrumSeedType(phrase)).toBe("segwit");
    const material = await deriveMaterial({
      mnemonic: phrase,
      passphrase: "",
      bip39: false,
      electrum: "segwit",
      count: 1,
      chains: all,
    });
    const [account] = material.btc[0];
    expect(account.address(0, 0).address).toBe("bc1q3g5tmkmlvxryhh843v4dz026avatc0zzr6h3af");
    expect(account.address(1, 0).address).toBe("bc1qdy94n2q5qcp0kg7v9yzwe6wvfkhnvyzje7nx2p");
    expect(account.address(0, 0).path).toBe("m/0'/0/0");
  });
});

describe("ethereum", () => {
  const groups = deriveEthGroups(root(), 3);
  const byId = (id: string) => groups.find((g) => g.group.id === id)!.addresses;

  it("derives the standard BIP44 path", () => {
    expect(byId("eth-standard").map((a) => a.address).slice(0, 2)).toEqual([
      "0x9858EfFD232B4033E47d90003D41EC34EcaEda94",
      "0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0",
    ]);
  });

  it("derives Ledger Live accounts starting at #2", () => {
    const [first, second] = byId("eth-ledger-live");
    expect(first).toMatchObject({ address: "0x78839F6054d7ed13918bAe0473BA31b1Ca9D7265", path: "m/44'/60'/1'/0/0" });
    expect(second.address).toBe("0x07B5FdfEB4E11826D233403Fe8Db0611CCF4c231");
  });

  it("derives the legacy Ledger path", () => {
    expect(byId("eth-ledger-legacy").map((a) => a.address).slice(0, 2)).toEqual([
      "0xB8Fd42000d00202DCbCF5e18d6640d656345FD6A",
      "0x94381955F4028159A477a107510618aDb6B79Eb7",
    ]);
  });

  it("applies EIP-55 checksums", () => {
    expect(toChecksumAddress("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed")).toBe(
      "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    );
  });
});

describe("solana", () => {
  const groups = deriveSolGroups(seed, 2);
  const byId = (id: string) => groups.find((g) => g.group.id === id)!.addresses.map((a) => a.address);

  it("derives Phantom / Solflare accounts", () => {
    expect(byId("sol-standard")).toEqual([
      "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk",
      "Hh8QwFUA6MtVu1qAoq12ucvFHNwCcVTV7hpWjeY1Hztb",
    ]);
  });

  it("derives Ledger / Trust Wallet accounts", () => {
    expect(byId("sol-ledger")).toEqual([
      "GjJyeC1r2RgkuoCWMyPYkCWSGSGLcz266EaAkLA27AhL",
      "ANf3TEKFL6jPWjzkndo4CbnNdUNkBk4KHPggJs2nu8Xi",
    ]);
  });

  it("derives the solana-keygen (no path) address", () => {
    expect(byId("sol-cli")).toEqual(["EHqmfkN89RJ7Y33CXM6uCzhVeuywHoJXZZLszBHHZy7o"]);
  });

  it("threads the BIP39 passphrase through", async () => {
    const material = await deriveMaterial({
      mnemonic: ABANDON,
      passphrase: "TREZOR",
      bip39: true,
      electrum: null,
      count: 1,
      chains: { btc: false, eth: false, sol: true },
    });
    expect(material.btc).toHaveLength(0);
    expect(material.sol[0].addresses[0].address).toBe("7zSmbu6gKkb6HB7UDPtHYjwCWuBHU1D4TpNZFm4sndQe");
  });

  it("matches the SLIP-0010 ed25519 test vector", () => {
    const vectorSeed = hexToBytes("000102030405060708090a0b0c0d0e0f");
    const master = slip10Master(vectorSeed);
    expect(bytesToHex(master.key)).toBe("2b4be7f19ee27bbf30c667b642d5f4aa69fd169872f8fc3059c08ebae2eb19e7");
    expect(bytesToHex(master.chainCode)).toBe("90046a93de5380a72b5e45010748567d5ea02bbf6522f979e05c0d8d8ca9fffb");
    const child = slip10DerivePath(vectorSeed, "m/0'");
    expect(bytesToHex(child.key)).toBe("68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3");
    expect(bytesToHex(child.chainCode)).toBe("8b59aa11380b624e81507a27fedda59fea6d0b779a778918a2fd3590e16e9c69");
  });

  it("computes associated token accounts", () => {
    const owner = "HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk";
    expect(associatedTokenAddress(owner, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBe(
      "5N3f1tj9v1vc5TUZ8S7mCAnVmjVKrfnzXWhxLaxyZAgt",
    );
    expect(associatedTokenAddress(owner, "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB")).toBe(
      "6pXYguUixhfdydHDMgsvSy3sAWjStL2eEYh4KeYJAUDk",
    );
  });
});

describe("deriveMaterial", () => {
  it("derives every chain for a BIP39 phrase", async () => {
    const material = await deriveMaterial({
      mnemonic: ABANDON,
      passphrase: "",
      bip39: true,
      electrum: null,
      count: 5,
      chains: all,
    });
    expect(material.btc).toHaveLength(BIP_SCHEMES.length);
    expect(material.btc[0][0].address(0, 0).address).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
    expect(material.eth.map((g) => g.addresses.length)).toEqual([5, 5, 5]);
    expect(material.sol.map((g) => g.addresses.length)).toEqual([5, 5, 1]);
  });
});
