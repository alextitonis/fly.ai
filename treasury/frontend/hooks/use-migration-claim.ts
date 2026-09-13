import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import type { Address, Hex } from "viem";
import { isAddress, zeroHash } from "viem";
import {
  getLocalMigrationClaimShardsBaseUrl,
  getMigrationClaimsBaseUrl,
  shouldUseLocalMigrationClaimShards,
} from "@/lib/migration-config";

/**
 * A single user's SHIT v1 → v2 migration allocation, looked up from the
 * shit-v1-balances proof API for the active merkle root.
 */
export type MigrationClaim = {
  /** Allocated SHIT v1 amount (raw, 9 decimals). Passed to `migrate` as `allocatedAmount`. */
  allocatedAmount: bigint;
  /** Merkle proof for `(address, allocatedAmount)`. */
  proof: Hex[];
};

type ProofResponse = {
  address: string;
  amount: string;
  merkleRoot: string;
  proof: string[];
};

type ShardClaim = { amount: string; proof: string[] };
type Shard = Record<string, ShardClaim>;
type ShardManifest = { merkleRoot: string; shardPrefixLength?: number };

function normalizeClaim(
  response: ProofResponse,
  expectedMerkleRoot: Hex,
  expectedAddress: Address,
): MigrationClaim {
  if (!isAddress(response.address)) {
    throw new Error("Migration proof response contained an invalid address.");
  }
  if (response.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error("Migration proof response address did not match the connected wallet.");
  }
  if (response.merkleRoot.toLowerCase() !== expectedMerkleRoot.toLowerCase()) {
    throw new Error("Migration proof response merkle root did not match the active root.");
  }

  return {
    allocatedAmount: BigInt(response.amount),
    proof: response.proof as Hex[],
  };
}

async function fetchProofClaim(baseUrl: string, merkleRoot: Hex, address: Address) {
  // The proof API keys claims by lowercase address (wagmi returns EIP-55 checksummed);
  // lowercase both path segments so a case-sensitive backend can't 404 an eligible user.
  const res = await fetch(`${baseUrl}/proof/${merkleRoot.toLowerCase()}/${address.toLowerCase()}/`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load migration proof: ${res.status}`);
  return (await res.json()) as ProofResponse;
}

async function fetchLocalShardClaim(address: Address) {
  const baseUrl = getLocalMigrationClaimShardsBaseUrl();

  // The manifest carries the tree's real merkle root; surfacing it (rather than echoing
  // the expected root back) lets normalizeClaim reject stale shards from an old test tree.
  const manifestRes = await fetch(`${baseUrl}/manifest.json`);
  if (manifestRes.status === 404) return null;
  if (!manifestRes.ok) {
    throw new Error(`Failed to load migration shard manifest: ${manifestRes.status}`);
  }
  const manifest = (await manifestRes.json()) as ShardManifest;

  const lower = address.toLowerCase();
  const prefix = lower.slice(2, 2 + (manifest.shardPrefixLength ?? 2));
  const res = await fetch(`${baseUrl}/claims-${prefix}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load migration shard ${prefix}: ${res.status}`);

  const shard = (await res.json()) as Shard;
  const claim = shard[lower];
  if (!claim) return null;

  console.info("[V1Migrator] Using local migration claim shard", {
    address,
    merkleRoot: manifest.merkleRoot,
    claimsBaseUrl: baseUrl,
  });

  return {
    address,
    amount: claim.amount,
    merkleRoot: manifest.merkleRoot,
    proof: claim.proof,
  };
}

async function fetchClaim(
  baseUrl: string,
  merkleRoot: Hex,
  address: Address,
  useLocalShardFallback: boolean,
) {
  if (!useLocalShardFallback) return fetchProofClaim(baseUrl, merkleRoot, address);

  // In dev, fall back to the local shards on any proof-API failure (network/CORS/5xx),
  // not just a clean 404 — the API may be unreachable from a local fork setup.
  let claim: ProofResponse | null = null;
  try {
    claim = await fetchProofClaim(baseUrl, merkleRoot, address);
  } catch (error) {
    console.warn("[V1Migrator] Proof API failed; falling back to local claim shards", { error });
  }
  return claim ?? fetchLocalShardClaim(address);
}

/** Look up the connected wallet's migration claim from the root-scoped proof API. */
export function useMigrationClaim(merkleRoot?: Hex) {
  const { address } = useConnectedAddress();
  const baseUrl = getMigrationClaimsBaseUrl();
  const useLocalShardFallback = shouldUseLocalMigrationClaimShards();
  const hasMerkleRoot = !!merkleRoot && merkleRoot !== zeroHash;
  const enabled = hasMerkleRoot && !!address;

  const {
    data: claim,
    isLoading,
    error,
    isFetched,
  } = useQuery({
    queryKey: ["migrationClaim", baseUrl, merkleRoot, address, useLocalShardFallback],
    queryFn: () =>
      fetchClaim(baseUrl, merkleRoot as Hex, address as Address, useLocalShardFallback),
    enabled,
    select: (response) =>
      response ? normalizeClaim(response, merkleRoot as Hex, address as Address) : null,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!enabled || isLoading) return;

    if (error) {
      console.warn("[V1Migrator] Failed to load migration claim", {
        address,
        merkleRoot,
        claimsBaseUrl: baseUrl,
        error,
      });
      return;
    }

    if (isFetched && !claim) {
      console.info("[V1Migrator] No migration claim found", {
        address,
        merkleRoot,
        claimsBaseUrl: baseUrl,
      });
    }
  }, [address, baseUrl, claim, enabled, error, isFetched, isLoading, merkleRoot]);

  return {
    claim: claim ?? null,
    isEligible: !!claim,
    isLoading,
    error: error as Error | null,
  };
}
