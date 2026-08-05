import { sha256 } from "@noble/hashes/sha2.js";
import type { Address } from "@solana/kit";
import { MerkleTree } from "merkletreejs";

import { MerkleDistributorClientError } from "./errors.js";
import { parseAllocationsCsv } from "./papaparse.js";
import type { Allocation, Claim, Distribution } from "./types.js";
import {
  ADDRESS_ENCODER,
  assertAmount,
  concatBytes,
  MAX_U64,
  parseAddress,
  toHex,
} from "./utils.js";

/** Parses CSV allocation text and constructs its distributor-bound Merkle artifact. */
export function buildDistributionFromCsv(distributor: Address, csv: string): Distribution {
  return buildDistribution(distributor, parseAllocationsCsv(csv));
}

/** Encodes the allocation bytes hashed by the on-chain claim instruction. */
export function encodeAllocation(
  distributor: Address,
  claimant: Address,
  amount: bigint,
): Uint8Array {
  const output = new Uint8Array(72);
  output.set(ADDRESS_ENCODER.encode(parseAddress(distributor, "distributor")), 0);
  output.set(ADDRESS_ENCODER.encode(parseAddress(claimant, "claimant")), 32);
  new DataView(output.buffer).setBigUint64(64, assertAmount(amount, "amount"), true);
  return output;
}

/** Builds a deterministic Merkle artifact from allocations in their original order. */
export function buildDistribution(
  distributor: Address,
  allocations: readonly Allocation[],
): Distribution {
  const validatedDistributor = parseAddress(distributor, "distributor");
  if (allocations.length === 0) {
    throw new MerkleDistributorClientError("at least one allocation is required");
  }

  const claimantAddresses = new Set<string>();
  let maxTotalClaim = 0n;
  const claims: Claim[] = allocations.map(({ claimant, amount }, index) => {
    const validatedClaimant = parseAddress(claimant, `allocation ${index + 1} claimant`);
    if (claimantAddresses.has(validatedClaimant)) {
      throw new MerkleDistributorClientError(`duplicate claimant: ${validatedClaimant}`);
    }
    claimantAddresses.add(validatedClaimant);

    const validatedAmount = assertAmount(amount, `allocation ${index + 1} amount`);
    maxTotalClaim += validatedAmount;
    if (maxTotalClaim > MAX_U64) {
      throw new MerkleDistributorClientError("total allocation amount exceeds u64");
    }

    return {
      claimant: validatedClaimant,
      amount: validatedAmount,
      leaf: hashLeaf(encodeAllocation(validatedDistributor, validatedClaimant, validatedAmount)),
      proof: [],
    };
  });

  const tree = new MerkleTree(
    claims.map(({ leaf }) => Buffer.from(leaf)),
    hashNode,
    { duplicateOdd: false, sortLeaves: false, sortPairs: true },
  );
  for (const claim of claims) {
    claim.proof = tree.getProof(Buffer.from(claim.leaf)).map(({ data }) => Uint8Array.from(data));
  }

  return {
    distributor: validatedDistributor,
    root: Uint8Array.from(tree.getRoot()),
    maxTotalClaim,
    claims,
  };
}

/** Converts a distribution to a JSON-safe artifact without lossy number conversion. */
export function serializeDistribution(distribution: Distribution): string {
  return JSON.stringify({
    distributor: distribution.distributor,
    root: toHex(distribution.root),
    maxTotalClaim: distribution.maxTotalClaim.toString(),
    claims: distribution.claims.map((claim) => ({
      claimant: claim.claimant,
      amount: claim.amount.toString(),
      leaf: toHex(claim.leaf),
      proof: claim.proof.map(toHex),
    })),
  });
}

export function hashPair(left: Uint8Array, right: Uint8Array): Uint8Array {
  const [first, second] = Buffer.compare(left, right) <= 0 ? [left, right] : [right, left];
  return Uint8Array.from(hashNode(Buffer.concat([first, second])));
}

function hashLeaf(allocation: Uint8Array): Uint8Array {
  return sha256(concatBytes(Uint8Array.of(0), allocation));
}

function hashNode(nodes: Buffer): Buffer {
  return Buffer.from(sha256(concatBytes(Uint8Array.of(1), nodes)));
}
