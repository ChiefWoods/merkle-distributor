import {
  createKeyPairSignerFromPrivateKeyBytes,
  generateKeyPairSigner,
  type Address,
  type Account,
  type KeyPairSigner,
} from "@solana/kit";
import {
  QuasarSvm,
  createKeyedAssociatedTokenAccount,
  createKeyedMintAccount,
  createKeyedSystemAccount,
} from "@blueshift-gg/quasar-svm/kit";
import {
  getTokenDecoder,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { beforeAll, describe, expect, it } from "vitest";

import { buildDistributionFromCsv, type Distribution } from "../client/src/index.js";
import {
  findClaimStatusAddress,
  findDistributorAddress,
} from "../target/client/typescript/merkle_distributor/kit.js";
import {
  CLAIM_TIMESTAMP,
  CLAWBACK_TIMESTAMP,
  CLOCK,
  claimIx,
  clawbackIx,
  client,
  createDistributorIx,
  findEventAuthority,
  loadProgram,
  updateIx,
} from "./common.js";

describe("MerkleDistributor Program", () => {
  const vm = new QuasarSvm();
  let accounts: Account<Uint8Array>[] = [];
  let authority: KeyPairSigner;
  let base: KeyPairSigner;
  let claimant: KeyPairSigner;
  let clawbackReceiver: KeyPairSigner;
  let updatedClawbackReceiver: KeyPairSigner;
  let mint: KeyPairSigner;
  let distributor: Address;
  let distributorVault: Address;
  let authorityTokenAccount: Address;
  let claimantTokenAccount: Address;
  let updatedClawbackReceiverTokenAccount: Address;
  let eventAuthority: Address;
  let distribution: Distribution;

  beforeAll(async () => {
    await loadProgram(vm);

    [authority, base, clawbackReceiver, updatedClawbackReceiver, mint, claimant] =
      await Promise.all([
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        generateKeyPairSigner(),
        createKeyPairSignerFromPrivateKeyBytes(
          Uint8Array.from({ length: 32 }, (_, index) => index + 1),
        ),
      ]);

    distributor = await findDistributorAddress(base.address);
    [distributorVault] = await findAssociatedTokenPda({
      owner: distributor,
      mint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    [authorityTokenAccount] = await findAssociatedTokenPda({
      owner: authority.address,
      mint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    [claimantTokenAccount] = await findAssociatedTokenPda({
      owner: claimant.address,
      mint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    [updatedClawbackReceiverTokenAccount] = await findAssociatedTokenPda({
      owner: updatedClawbackReceiver.address,
      mint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    eventAuthority = await findEventAuthority();

    distribution = buildDistributionFromCsv(
      distributor,
      await Bun.file("tests/fixtures/allocations.csv").text(),
    );
    expect(distribution.claims[0]!.claimant).toBe(claimant.address);

    accounts = [
      createKeyedSystemAccount(authority.address, 10_000_000_000n),
      createKeyedSystemAccount(base.address),
      createKeyedSystemAccount(claimant.address, 10_000_000_000n),
      createKeyedSystemAccount(clawbackReceiver.address),
      createKeyedSystemAccount(updatedClawbackReceiver.address),
      createKeyedMintAccount(mint.address, { decimals: 6 }),
      await createKeyedAssociatedTokenAccount(
        authority.address,
        mint.address,
        distribution.maxTotalClaim,
      ),
      createKeyedSystemAccount(distributor, 0n),
      await createKeyedAssociatedTokenAccount(distributor, mint.address, 0n),
      createKeyedSystemAccount(eventAuthority, 0n),
    ];
  });

  it("creates a distributor with a future claim timestamp and funds its vault", async () => {
    const result = vm.processInstruction(
      await createDistributorIx({
        authority: authority.address,
        base: base.address,
        mint: mint.address,
        tokenAccount: authorityTokenAccount,
        distributorVault,
        eventAuthority,
        clawbackReceiver: clawbackReceiver.address,
        distribution,
      }),
      accounts,
    );

    expect(result.status.ok, result.logs.join("\n")).toBe(true);
    expect(client.decodeDistributor(result.account(distributor)!.data)).toMatchObject({
      authority: authority.address,
      clawback_receiver: clawbackReceiver.address,
      total_claimed: 0n,
      nodes_claimed: 0n,
      root: distribution.root,
    });
    expect(result.account(distributorVault, getTokenDecoder())!.amount).toBe(
      distribution.maxTotalClaim,
    );
    accounts = result.accounts;
  });

  it("updates the clawback receiver before the claim period starts", () => {
    const result = vm.processInstruction(
      updateIx({
        authority: authority.address,
        distributor,
        eventAuthority,
        clawbackReceiver: updatedClawbackReceiver.address,
      }),
      accounts,
    );

    expect(result.status.ok, result.logs.join("\n")).toBe(true);
    expect(client.decodeDistributor(result.account(distributor)!.data).clawback_receiver).toBe(
      updatedClawbackReceiver.address,
    );
    accounts = result.accounts;
  });

  it("claims an allocation after the clock reaches the claim timestamp", async () => {
    vm.setClock({ ...CLOCK, slot: 2n, unixTimestamp: CLAIM_TIMESTAMP });
    const claim = distribution.claims[0]!;
    const claimStatus = await findClaimStatusAddress(distributor, claimant.address);
    const result = vm.processInstruction(
      await claimIx(
        {
          claimant: claimant.address,
          distributor,
          mint: mint.address,
          distributorVault,
          claimantTokenAccount,
          eventAuthority,
        },
        claim,
      ),
      [
        ...accounts,
        createKeyedSystemAccount(claimStatus, 0n),
        await createKeyedAssociatedTokenAccount(claimant.address, mint.address, 0n),
      ],
    );

    expect(result.status.ok, result.logs.join("\n")).toBe(true);
    expect(client.decodeClaimStatus(result.account(claimStatus)!.data)).toMatchObject({
      distributor,
      claimant: claimant.address,
      claimed_amount: claim.amount,
    });
    expect(client.decodeDistributor(result.account(distributor)!.data)).toMatchObject({
      total_claimed: claim.amount,
      nodes_claimed: 1n,
    });
    expect(result.account(claimantTokenAccount, getTokenDecoder())!.amount).toBe(claim.amount);
    accounts = result.accounts;
  });

  it("claws back the unclaimed balance after the clock reaches the clawback timestamp", async () => {
    vm.setClock({ ...CLOCK, slot: 3n, unixTimestamp: CLAWBACK_TIMESTAMP });
    const result = vm.processInstruction(
      clawbackIx({
        payer: claimant.address,
        authority: authority.address,
        clawbackReceiver: updatedClawbackReceiver.address,
        distributor,
        mint: mint.address,
        distributorVault,
        clawbackReceiverTokenAccount: updatedClawbackReceiverTokenAccount,
        eventAuthority,
      }),
      [
        ...accounts,
        await createKeyedAssociatedTokenAccount(updatedClawbackReceiver.address, mint.address, 0n),
      ],
    );

    expect(result.status.ok, result.logs.join("\n")).toBe(true);
    expect(client.decodeDistributor(result.account(distributor)!.data).has_clawed_back).toBe(true);
    expect(result.account(updatedClawbackReceiverTokenAccount, getTokenDecoder())!.amount).toBe(
      distribution.maxTotalClaim - distribution.claims[0]!.amount,
    );
  });
});
