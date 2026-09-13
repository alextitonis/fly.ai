import { type Address, hexToSignature, type WalletClient } from "viem";

export interface AuthorizationStruct {
  account: Address;
  authorized: Address;
  authorizationDeadline: bigint;
  nonce: bigint;
  signatureDeadline: bigint;
}

export interface AuthorizationSignature {
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

export async function getAuthorizationSignature({
  userAddress,
  authorizedAddress,
  verifyingContract,
  chainId,
  deadline = BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
  nonce,
  walletClient,
}: {
  userAddress: Address;
  authorizedAddress: Address;
  verifyingContract: Address;
  chainId: number;
  deadline?: bigint;
  nonce: bigint;
  walletClient: WalletClient;
}): Promise<{ auth: AuthorizationStruct; signature: AuthorizationSignature }> {
  const auth: AuthorizationStruct = {
    account: userAddress,
    authorized: authorizedAddress,
    authorizationDeadline: deadline,
    nonce,
    signatureDeadline: deadline,
  };

  const domain = {
    chainId,
    verifyingContract,
  } as const;

  const types = {
    Authorization: [
      { name: "account", type: "address" },
      { name: "authorized", type: "address" },
      { name: "authorizationDeadline", type: "uint96" },
      { name: "nonce", type: "uint256" },
      { name: "signatureDeadline", type: "uint256" },
    ],
  } as const;

  const sig = await walletClient.signTypedData({
    domain,
    types,
    primaryType: "Authorization",
    message: {
      account: auth.account,
      authorized: auth.authorized,
      authorizationDeadline: auth.authorizationDeadline,
      nonce: auth.nonce,
      signatureDeadline: auth.signatureDeadline,
    },
    account: userAddress,
  } as any);

  const { v, r, s } = hexToSignature(sig);

  return {
    auth,
    signature: { v: Number(v), r, s },
  };
}

/** Empty auth/signature for already-authorized smart contract wallets */
export const EMPTY_AUTH: AuthorizationStruct = {
  account: "0x0000000000000000000000000000000000000000",
  authorized: "0x0000000000000000000000000000000000000000",
  authorizationDeadline: 0n,
  nonce: 0n,
  signatureDeadline: 0n,
};

export const EMPTY_SIGNATURE: AuthorizationSignature = {
  v: 0,
  r: "0x0000000000000000000000000000000000000000000000000000000000000000",
  s: "0x0000000000000000000000000000000000000000000000000000000000000000",
};
