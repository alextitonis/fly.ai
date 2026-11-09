/** Talks to the SnipeHelper contract: simulations (eth_call, optionally with the code injected so no deploy is
 * needed) and the owner's real buy / sell transactions. */
import {
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  defineChain,
  encodeFunctionData,
  http,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import artifact from "./SnipeHelper.json" with { type: "json" };
import type { Config } from "./config.js";

export const HELPER_ABI = artifact.abi as any;
export const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
]);

/** Fake addresses used for paper simulations (code and balance injected with eth_call state overrides). */
const SIM_HELPER: Address = "0x000000000000000000000000000000005e1f5e1f";
const SIM_FROM: Address = "0x00000000000000000000000000000000000f1a1a";

export type Kind = 2 | 3 | 4;
export interface Route {
  kind: Kind;
  pool: Address; // v2 pair, v3 pool, or v4 PoolManager
  token: Address;
  quote: Address; // WHYPE, or 0x0 for native HYPE (v4 only)
  v2FeeBps: number;
  key: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
}
export const ZERO: Address = "0x0000000000000000000000000000000000000000";
export const NO_KEY = { currency0: ZERO, currency1: ZERO, fee: 0, tickSpacing: 0, hooks: ZERO };

export interface Trip {
  ok: boolean;
  got: bigint;
  back: bigint;
  quoted: bigint;
  reason?: string;
}

export class Chain {
  pub: PublicClient;
  wallet?: WalletClient;
  account?: PrivateKeyAccount;
  chainId = 0;
  private rpcId = 1;

  constructor(public cfg: Config) {
    this.pub = createPublicClient({ transport: http(cfg.rpc, { timeout: 15_000 }) }) as PublicClient;
  }

  async init() {
    this.chainId = await this.pub.getChainId();
    const chain = defineChain({
      id: this.chainId,
      name: `elysium-${this.chainId}`,
      nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
      rpcUrls: { default: { http: [this.cfg.rpc] } },
    });
    this.pub = createPublicClient({ chain, transport: http(this.cfg.rpc, { timeout: 15_000 }) }) as PublicClient;
    if (this.cfg.privateKey) {
      this.account = privateKeyToAccount(this.cfg.privateKey as Hex);
      this.wallet = createWalletClient({ account: this.account, chain, transport: http(this.cfg.rpc) });
    }
    return this.chainId;
  }

  /** Raw eth_call so we control state overrides and get the revert bytes back. */
  private async rawCall(tx: object, override?: object): Promise<{ result?: Hex; revert?: Hex; error?: string }> {
    const params: unknown[] = [tx, "latest"];
    if (override) params.push(override);
    const res = await fetch(this.cfg.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.rpcId++, method: "eth_call", params }),
    });
    const j: any = await res.json();
    if (j.error) {
      const d = j.error.data;
      const data = typeof d === "string" ? d : d?.data;
      if (typeof data === "string" && data.startsWith("0x")) return { revert: data as Hex };
      return { error: String(j.error.message ?? "call failed") };
    }
    return { result: j.result };
  }

  /** Simulations always run the helper's code injected at a fake address with a fake funded sender, in paper and
   * live mode alike: no deploy, no balance and no tokens needed. */
  private simTarget(_helper?: Address, value = 0n) {
    return {
      to: SIM_HELPER,
      from: SIM_FROM,
      override: {
        [SIM_HELPER]: { code: artifact.deployedBytecode },
        [SIM_FROM]: { balance: "0x" + (value + 10n ** 24n).toString(16) },
      },
    };
  }

  /** Buy with `amount` HYPE then sell it all back, in one eth_call. Nothing is kept. */
  async roundTrip(r: Route, amount: bigint, helper?: Address): Promise<Trip> {
    const t = this.simTarget(helper, amount);
    const data = encodeFunctionData({ abi: HELPER_ABI, functionName: "roundTrip", args: [r] });
    const res = await this.rawCall({ from: t.from, to: t.to, data, value: "0x" + amount.toString(16) }, t.override);
    if (!res.revert) return { ok: false, got: 0n, back: 0n, quoted: 0n, reason: res.error ?? "no revert" };
    try {
      const e = decodeErrorResult({ abi: HELPER_ABI, data: res.revert });
      if (e.errorName === "RoundTrip") {
        const [got, back, quoted] = e.args as readonly bigint[];
        return { ok: back > 0n, got, back, quoted, reason: back > 0n ? undefined : "sold for 0" };
      }
      return { ok: false, got: 0n, back: 0n, quoted: 0n, reason: e.errorName };
    } catch {
      return { ok: false, got: 0n, back: 0n, quoted: 0n, reason: `revert ${res.revert.slice(0, 10)}` };
    }
  }

  /** The pool's price (HYPE out) for selling `amount` tokens; no tokens needed. Transfer taxes not included. */
  async quoteSell(r: Route, amount: bigint, helper?: Address): Promise<bigint | null> {
    return this.quote(r, amount, 0n, helper);
  }

  /** Paper: value `amount` tokens as if our `spent` HYPE buy had landed (fresh launch pools hold little HYPE). */
  async quoteAfterBuy(r: Route, amount: bigint, spent: bigint): Promise<bigint | null> {
    return this.quote(r, amount, spent);
  }

  private async quote(r: Route, amount: bigint, spent: bigint, helper?: Address): Promise<bigint | null> {
    // live bags: ask the real helper that holds them (some launchpad hooks refuse a sell quote from an address that
    // never bought, so a quote from the fake simulation address fails and looked like an unsellable token)
    const t = helper && spent === 0n ? { from: SIM_FROM, to: helper, override: undefined } : this.simTarget(helper, spent);
    const data = spent > 0n
      ? encodeFunctionData({ abi: HELPER_ABI, functionName: "quoteAfterBuy", args: [r, amount] })
      : encodeFunctionData({ abi: HELPER_ABI, functionName: "quoteSell", args: [r, amount] });
    const res = await this.rawCall({ from: t.from, to: t.to, data, value: "0x" + spent.toString(16) }, t.override);
    if (!res.revert) return null;
    try {
      const e = decodeErrorResult({ abi: HELPER_ABI, data: res.revert });
      return e.errorName === "Quote" ? (e.args as readonly bigint[])[0] : null;
    } catch {
      return null;
    }
  }

  async symbol(token: Address): Promise<string> {
    try {
      return String(await this.pub.readContract({ address: token, abi: ERC20, functionName: "symbol" })).slice(0, 16);
    } catch {
      return token.slice(0, 8);
    }
  }

  async tokenBalance(token: Address, who: Address): Promise<bigint> {
    return (await this.pub.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [who] })) as bigint;
  }

  // ------------------------------------------------------------- live (owner) transactions

  private need() {
    if (!this.wallet || !this.account) throw new Error("PRIVATE_KEY is not set");
    return { wallet: this.wallet, account: this.account };
  }

  async deployHelper(): Promise<Address> {
    const { wallet, account } = this.need();
    const hash = await wallet.deployContract({
      abi: HELPER_ABI,
      bytecode: artifact.bytecode as Hex,
      account,
      chain: wallet.chain,
    });
    const rc = await this.pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (rc.status !== "success" || !rc.contractAddress) throw new Error(`deploy failed: ${hash}`);
    return rc.contractAddress;
  }

  /** Returns tokens received by the helper. */
  async buy(helper: Address, r: Route, amount: bigint, minOut: bigint): Promise<{ got: bigint; hash: Hex }> {
    const { wallet, account } = this.need();
    const before = await this.tokenBalance(r.token, helper);
    const { request } = await this.pub.simulateContract({
      address: helper, abi: HELPER_ABI, functionName: "buy", args: [r, minOut], value: amount, account,
    });
    const hash = await wallet.writeContract(request as any);
    const rc = await this.pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (rc.status !== "success") throw new Error(`buy reverted: ${hash}`);
    const after = await this.tokenBalance(r.token, helper);
    return { got: after - before, hash };
  }

  /** Sells `amount` tokens (or all with amount = -1n); HYPE goes to the wallet. Returns HYPE received. */
  async sell(helper: Address, r: Route, amount: bigint, minOut: bigint): Promise<{ out: bigint; hash: Hex }> {
    const { wallet, account } = this.need();
    const amt = amount < 0n ? 2n ** 256n - 1n : amount;
    const { request, result } = await this.pub.simulateContract({
      address: helper, abi: HELPER_ABI, functionName: "sell", args: [r, amt, minOut], account,
    });
    const hash = await wallet.writeContract(request as any);
    const rc = await this.pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (rc.status !== "success") throw new Error(`sell reverted: ${hash}`);
    return { out: result as bigint, hash };
  }

  async ownerCall(helper: Address, functionName: "withdraw" | "sweep", args: unknown[]): Promise<Hex> {
    const { wallet, account } = this.need();
    const { request } = await this.pub.simulateContract({ address: helper, abi: HELPER_ABI, functionName, args, account });
    const hash = await wallet.writeContract(request as any);
    await this.pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    return hash;
  }
}
