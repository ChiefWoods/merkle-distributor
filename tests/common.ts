import { getProgramDerivedAddress, type Address, type Instruction } from "@solana/kit";
import { QuasarSvm, type ExecutionResult } from "@blueshift-gg/quasar-svm/kit";
import { expect } from "vitest";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

import type { Claim, Distribution } from "../client/src/index.js";
import {
  MerkleDistributorClient,
  PROGRAM_ADDRESS,
  PROGRAM_ERRORS,
  type ClaimInstructionInput,
  type ClawbackInstructionInput,
  type CreateDistributorInstructionInput,
  type UpdateDistributorInstructionInput,
} from "../target/client/typescript/merkle_distributor/kit.js";

export const client = new MerkleDistributorClient();
export const CLOCK = {
  slot: 1n,
  epochStartTimestamp: 0n,
  epoch: 0n,
  leaderScheduleEpoch: 0n,
  unixTimestamp: 100n,
};
export const CLAIM_TIMESTAMP = 1_000n;
export const CLAWBACK_TIMESTAMP = 2_000n;

const programBinary = Bun.file("target/deploy/merkle_distributor.so");

export async function loadProgram(svm: QuasarSvm, clock = CLOCK): Promise<void> {
  svm.addProgram(PROGRAM_ADDRESS, new Uint8Array(await programBinary.arrayBuffer()));
  svm.setClock(clock);
}

export async function findEventAuthority(): Promise<Address> {
  return (
    await getProgramDerivedAddress({
      programAddress: PROGRAM_ADDRESS,
      seeds: ["__event_authority"],
    })
  )[0];
}

/** Quasar SVM maps Custom(0) to ok:true; assert via program logs for every custom code. */
export function expectCustomError(result: ExecutionResult, name: string): void {
  const entry = Object.entries(PROGRAM_ERRORS).find(([, error]) => error.name === name);
  expect(entry, `unknown program error: ${name}`).toBeDefined();
  const code = Number(entry![0]);
  const needle = `custom program error: 0x${code.toString(16)}`;
  expect(
    result.logs.some((log) => log.includes(needle)),
    result.logs.join("\n"),
  ).toBe(true);
  if (code !== 0) {
    expect(result.status).toEqual({ ok: false, error: { type: "Custom", code } });
  }
}

export type CreateDistributorDefaults = {
  authority: Address;
  base: Address;
  mint: Address;
  tokenAccount: Address;
  distributorVault: Address;
  eventAuthority: Address;
  clawbackReceiver: Address;
  distribution: Distribution;
};

export async function createDistributorIx(
  defaults: CreateDistributorDefaults,
  overrides: Partial<CreateDistributorInstructionInput> = {},
): Promise<Instruction> {
  return client.createCreateDistributorInstruction({
    authority: defaults.authority,
    base: defaults.base,
    mint: defaults.mint,
    tokenAccount: defaults.tokenAccount,
    distributorVault: defaults.distributorVault,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    eventAuthority: defaults.eventAuthority,
    program: PROGRAM_ADDRESS,
    claim_timestamp: CLAIM_TIMESTAMP,
    clawback_timestamp: CLAWBACK_TIMESTAMP,
    clawback_receiver: defaults.clawbackReceiver,
    max_total_claim: defaults.distribution.maxTotalClaim,
    max_nodes: BigInt(defaults.distribution.claims.length),
    root: defaults.distribution.root,
    ...overrides,
  });
}

export type ClaimDefaults = {
  claimant: Address;
  distributor: Address;
  mint: Address;
  distributorVault: Address;
  claimantTokenAccount: Address;
  eventAuthority: Address;
};

export async function claimIx(
  defaults: ClaimDefaults,
  claim: Pick<Claim, "amount" | "proof">,
  overrides: Partial<ClaimInstructionInput> = {},
): Promise<Instruction> {
  return client.createClaimInstruction({
    claimant: defaults.claimant,
    distributor: defaults.distributor,
    mint: defaults.mint,
    distributorVault: defaults.distributorVault,
    claimantTokenAccount: defaults.claimantTokenAccount,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    eventAuthority: defaults.eventAuthority,
    program: PROGRAM_ADDRESS,
    amount: claim.amount,
    proof: claim.proof,
    ...overrides,
  });
}

export type UpdateDefaults = {
  authority: Address;
  distributor: Address;
  eventAuthority: Address;
  clawbackReceiver: Address;
};

export function updateIx(
  defaults: UpdateDefaults,
  overrides: Partial<UpdateDistributorInstructionInput> = {},
): Instruction {
  return client.createUpdateDistributorInstruction({
    authority: defaults.authority,
    distributor: defaults.distributor,
    eventAuthority: defaults.eventAuthority,
    program: PROGRAM_ADDRESS,
    clawback_receiver: defaults.clawbackReceiver,
    ...overrides,
  });
}

export type ClawbackDefaults = {
  payer: Address;
  authority: Address;
  clawbackReceiver: Address;
  distributor: Address;
  mint: Address;
  distributorVault: Address;
  clawbackReceiverTokenAccount: Address;
  eventAuthority: Address;
};

export function clawbackIx(
  defaults: ClawbackDefaults,
  overrides: Partial<ClawbackInstructionInput> = {},
): Instruction {
  return client.createClawbackInstruction({
    payer: defaults.payer,
    authority: defaults.authority,
    clawbackReceiver: defaults.clawbackReceiver,
    distributor: defaults.distributor,
    mint: defaults.mint,
    distributorVault: defaults.distributorVault,
    clawbackReceiverTokenAccount: defaults.clawbackReceiverTokenAccount,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    eventAuthority: defaults.eventAuthority,
    program: PROGRAM_ADDRESS,
    ...overrides,
  });
}
