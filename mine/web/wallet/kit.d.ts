export interface WalletOption {
    uid: string;
    name: string;
    icon: string | null;
    kind: "browser" | "walletconnect";
}
export interface Connection {
    address: string;
    chainId: number | undefined;
    wallet: string;
}
/** The server's chain (Robinhood Chain in production, anvil in tests), from /api/orders/config. */
export interface ChainInfo {
    chain_id: number;
    chain_name: string;
    rpc: string;
    explorer: string;
    /** the chain's own coin when it isn't ETH (Berachain: BERA) */
    native?: {
        name: string;
        symbol: string;
    };
}
/** Once per page; resolves once a wallet connected earlier is back. Without a WalletConnect project id only wallets inside this browser are offered. */
export declare function setup(opts: {
    chain: ChainInfo;
    others?: ChainInfo[];
    walletConnectProjectId?: string;
    url: string;
    icon: string;
}): Promise<void>;
/** Wallets to offer: each one the browser announced, else the generic injected one, then WalletConnect. */
export declare function wallets(): WalletOption[];
/**
 * The wallet in use. Read from the connections themselves, not wagmi's status: a wallet extension that never answers
 * leaves the status at "connecting" forever, even while another wallet is connected and working.
 */
export declare function connection(): Connection | null;
export declare function onConnection(fn: (c: Connection | null) => void): () => void;
/** WalletConnect's relay can't be reached from this browser (a blocked network, an extension): no QR code can come. */
export declare class RelayUnreachable extends Error {
    name: string;
    constructor();
}
/** Connects the chosen wallet (a no-op when it's already the one connected) and returns the account. */
export declare function connect(uid: string): Promise<Connection>;
export declare function disconnect(): Promise<void>;
export declare function sign(message: string): Promise<string>;
/** One transaction, on the main chain unless `chainId` says otherwise. */
export declare function send(to: string, data: string, chainId?: any, value?: string): Promise<string>;
/** EIP-712 typed data, signed on the chain its domain names (wallets refuse a domain for another chain). */
export declare function signTyped(typed: {
    domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: string;
    };
    types: Record<string, {
        name: string;
        type: string;
    }[]>;
    primaryType: string;
    message: Record<string, unknown>;
}): Promise<string>;
/** Resolves when the transaction is mined; throws if it reverted. */
export declare function receipt(hash: string, chainId?: any): Promise<void>;
