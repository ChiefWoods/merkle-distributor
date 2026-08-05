import type { Address } from "@solana/kit";

export interface Allocation {
  claimant: Address;
  amount: bigint;
}

export interface Claim extends Allocation {
  leaf: Uint8Array;
  proof: Uint8Array[];
}

export interface Distribution {
  distributor: Address;
  root: Uint8Array;
  maxTotalClaim: bigint;
  claims: Claim[];
}
