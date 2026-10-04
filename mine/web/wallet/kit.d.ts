// Types for kit.js, the wagmi bundle built from mine/wallet/src/kit.ts. `npm run types` in mine/wallet (part of
// `npm run build` there since 2026-10-04) regenerates this file from it; until then keep the two in step by hand.
export interface WalletOption { uid: string; name: string; icon: string | null; kind: "browser" | "walletconnect" }
export interface Connection { address: string; chainId: number | undefined; wallet: string }
export interface ChainInfo { chain_id: number; chain_name: string; rpc: string; explorer: string }
export function setup(opts: { chain: ChainInfo; others?: ChainInfo[]; walletConnectProjectId?: string; url: string; icon: string }): Promise<void>;
export function wallets(): WalletOption[];
export function connection(): Connection | null;
export function onConnection(fn: (c: Connection | null) => void): () => void;
export function connect(uid: string): Promise<Connection>;
export function disconnect(): Promise<void>;
export function sign(message: string): Promise<string>;
export function send(to: string, data: string, chainId?: number): Promise<string>;
export function signTyped(typed: { domain: { name: string; version: string; chainId: number; verifyingContract: string }; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> }): Promise<string>;
export function receipt(hash: string, chainId?: number): Promise<void>;
