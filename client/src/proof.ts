import type { Address } from "@solana/kit";

import { MerkleDistributorClientError } from "./errors.js";
import { hashPair } from "./merkletree.js";
import type { Distribution } from "./types.js";
import { equalBytes } from "./utils.js";

/** Returns the sorted-pair Merkle proof for a claimant's allocation. */
export function getClaimProof(distribution: Distribution, claimant: Address): Uint8Array[] {
  const claim = distribution.claims.find(({ claimant: value }) => value === claimant);
  if (claim === undefined) {
    throw new MerkleDistributorClientError(
      `claimant is not present in the distribution: ${claimant}`,
    );
  }
  return claim.proof.map((node) => Uint8Array.from(node));
}

/** Verifies a proof using the same domain-separated parent hash as the program. */
export function verifyProof(
  root: Uint8Array,
  leaf: Uint8Array,
  proof: readonly Uint8Array[],
): boolean {
  let computed = new Uint8Array(leaf);
  for (const sibling of proof) {
    computed = Uint8Array.from(hashPair(computed, sibling));
  }
  return equalBytes(root, computed);
}
