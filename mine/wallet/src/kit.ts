/**
 * wagmi for the compute pages, bundled by build.mjs into web/wallet/kit.js (the pages themselves are plain modules
 * with no bundler). Browser wallets are found through EIP-6963, and phones reach a wallet app through WalletConnect
 * when a project id is set. wagmi keeps its connection under the same localStorage key as Flybook, so a wallet
 * connected on one is still connected on the other.
 */
import {
  connect as wagmiConnect, createConfig, disconnect as wagmiDisconnect, getConnectors, http, reconnect,
  sendTransaction, signMessage, signTypedData, switchChain, switchConnection, waitForTransactionReceipt, watchConnection, type Connector,
} from "@wagmi/core";
import { injected, walletConnect } from "@wagmi/connectors";
import { defineChain, type Hex } from "viem";

export interface WalletOption { uid: string; name: string; icon: string | null; kind: "browser" | "walletconnect" }
export interface Connection { address: string; chainId: number | undefined; wallet: string }
/** The server's chain (Robinhood Chain in production, anvil in tests), from /api/orders/config. */
export interface ChainInfo { chain_id: number; chain_name: string; rpc: string; explorer: string;
  /** the chain's own coin when it isn't ETH (Berachain: BERA) */
  native?: { name: string; symbol: string } }

let config: ReturnType<typeof createConfig> | null = null;
/** the main chain ($FLYAI); others (USDC on Base) are passed by id */
let chain: ReturnType<typeof defineChain>;

const toChain = (c: ChainInfo) => defineChain({
  id: c.chain_id,
  name: c.chain_name,
  nativeCurrency: { name: c.native?.name ?? "Ether", symbol: c.native?.symbol ?? "ETH", decimals: 18 },
  rpcUrls: { default: { http: [c.rpc] } },
  blockExplorers: { default: { name: "Explorer", url: c.explorer } },
});

/** Once per page; resolves once a wallet connected earlier is back. Without a WalletConnect project id only wallets inside this browser are offered. */
export async function setup(opts: { chain: ChainInfo; others?: ChainInfo[]; walletConnectProjectId?: string; url: string; icon: string }): Promise<void> {
  if (config) return;
  chain = toChain(opts.chain);
  const others = (opts.others ?? []).filter((c) => c.chain_id !== opts.chain.chain_id).map(toChain);
  const connectors = [injected()];
  if (opts.walletConnectProjectId) {
    connectors.push(walletConnect({
      projectId: opts.walletConnectProjectId,
      showQrModal: true,
      metadata: { name: "fly.ai compute", description: "Run the fruit-fly connectome, buy compute, stake and claim $FLYAI.", url: opts.url, icons: [opts.icon] },
    }) as unknown as ReturnType<typeof injected>);
  }
  config = createConfig({
    chains: [chain, ...others],
    connectors,
    transports: Object.fromEntries([chain, ...others].map((c) => [c.id, http(undefined, { timeout: 15_000, retryCount: 1 })])),
  });
  // reconnect asks each wallet in turn and waits for its answer, and a broken extension never answers (two wallet
  // extensions wrapping each other's window.ethereum recurse forever). Don't let that hold up the page.
  await Promise.race([reconnect(config).catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
}

const cfg = () => {
  if (!config) throw new Error("wallet kit used before setup()");
  return config;
};

/** Wallets to offer: each one the browser announced, else the generic injected one, then WalletConnect. */
export function wallets(): WalletOption[] {
  const all = getConnectors(cfg());
  const announced = all.filter((c) => c.type === "injected" && c.id !== "injected");
  const browser = announced.length ? announced : all.filter((c) => c.id === "injected" && hasInjected());
  return [
    ...browser.map((c) => ({ uid: c.uid, name: c.id === "injected" ? "Browser wallet" : c.name, icon: c.icon ?? null, kind: "browser" as const })),
    ...all.filter((c) => c.type === "walletConnect").map((c) => ({ uid: c.uid, name: "WalletConnect", icon: null, kind: "walletconnect" as const })),
  ];
}

const hasInjected = () => typeof window !== "undefined" && !!(window as unknown as { ethereum?: unknown }).ethereum;

/**
 * The wallet in use. Read from the connections themselves, not wagmi's status: a wallet extension that never answers
 * leaves the status at "connecting" forever, even while another wallet is connected and working.
 */
export function connection(): Connection | null {
  const { current, connections } = cfg().state;
  const c = current ? connections.get(current) : undefined;
  return c?.accounts[0] ? { address: c.accounts[0], chainId: c.chainId, wallet: c.connector.name } : null;
}

export function onConnection(fn: (c: Connection | null) => void): () => void {
  return watchConnection(cfg(), { onChange: () => fn(connection()) });
}

/** Connects the chosen wallet (a no-op when it's already the one connected) and returns the account. */
export async function connect(uid: string): Promise<Connection> {
  const connector = getConnectors(cfg()).find((c: Connector) => c.uid === uid);
  if (!connector) throw new Error("that wallet isn't available any more; reload the page");
  const { current, connections } = cfg().state;
  // already connected (maybe by reconnect): use it; wagmi refuses to connect a connector twice
  if (connections.has(uid)) {
    if (current !== uid) await switchConnection(cfg(), { connector });
  } else {
    await wagmiConnect(cfg(), { connector, chainId: chain.id });
  }
  const c = connection();
  if (!c) throw new Error("the wallet shared no account");
  return c;
}

export async function disconnect(): Promise<void> {
  if (connection()) await wagmiDisconnect(cfg());
}

export async function sign(message: string): Promise<string> {
  // the server's sign-in message names the main chain (Chain ID), and Phantom refuses one that isn't the wallet's own
  // chain ("Missing or invalid parameters", 2026-10-01). connect() asks for the chain, but wagmi drops a failed switch
  // silently, so switch here, as Flybook does before it signs, and say so when the wallet won't
  try {
    await onChain(chain.id);
  } catch (err) {
    if ((err as { code?: number }).code === 4001) throw err;
    throw new Error(`Switch your wallet to ${chain.name} to sign in.`);
  }
  return signMessage(cfg(), { message });
}

/** The wallet on `chainId` (switching it there, adding the chain if it must). */
async function onChain(chainId: number): Promise<void> {
  if (connection()?.chainId !== chainId) await switchChain(cfg(), { chainId: chainId as never });
}

/** One transaction, on the main chain unless `chainId` says otherwise. */
export async function send(to: string, data: string, chainId = chain.id, value?: string): Promise<string> {
  await onChain(chainId);
  // value: coin sent with the call, in wei as a decimal or 0x string (the token page's swap box paying in ETH)
  return sendTransaction(cfg(), { to: to as Hex, data: data as Hex, chainId: chainId as never, ...(value && BigInt(value) > 0n ? { value: BigInt(value) } : {}) });
}

/** EIP-712 typed data, signed on the chain its domain names (wallets refuse a domain for another chain). */
export async function signTyped(typed: { domain: { name: string; version: string; chainId: number; verifyingContract: string }; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> }): Promise<string> {
  await onChain(typed.domain.chainId);
  return signTypedData(cfg(), typed as never);
}

/** Resolves when the transaction is mined; throws if it reverted. */
export async function receipt(hash: string, chainId = chain.id): Promise<void> {
  const r = await waitForTransactionReceipt(cfg(), { hash: hash as Hex, chainId: chainId as never, timeout: 240_000 });
  if (r.status !== "success") throw new Error("the transaction failed on-chain");
}
