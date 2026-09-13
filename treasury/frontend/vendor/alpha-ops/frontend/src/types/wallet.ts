export type WalletState = {
  isAvailable: boolean;
  isConnecting: boolean;
  address: string | null;
  chainId: string | null;
  error: string | null;
  ethBalance: string | null;
};
