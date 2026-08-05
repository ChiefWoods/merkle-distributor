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
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildDistribution,
  buildDistributionFromCsv,
  type Distribution,
} from "../client/src/index.js";
import {
  findClaimStatusAddress,
  findDistributorAddress,
  type ClaimInstructionInput,
  type ClawbackInstructionInput,
  type CreateDistributorInstructionInput,
  type UpdateDistributorInstructionInput,
} from "../target/client/typescript/merkle_distributor/kit.js";
import {
  CLAIM_TIMESTAMP,
  CLAWBACK_TIMESTAMP,
  CLOCK,
  claimIx as buildClaimIx,
  clawbackIx as buildClawbackIx,
  createDistributorIx as buildCreateDistributorIx,
  expectCustomError,
  findEventAuthority,
  loadProgram,
  updateIx as buildUpdateIx,
} from "./common.js";

describe("MerkleDistributor errors", () => {
  let authority: KeyPairSigner;
  let base: KeyPairSigner;
  let claimant: KeyPairSigner;
  let clawbackReceiver: KeyPairSigner;
  let stranger: KeyPairSigner;
  let mint: KeyPairSigner;
  let otherMint: KeyPairSigner;
  let distributor: Address;
  let distributorVault: Address;
  let authorityTokenAccount: Address;
  let claimantTokenAccount: Address;
  let clawbackReceiverTokenAccount: Address;
  let eventAuthority: Address;
  let distribution: Distribution;
  let accounts: Account<Uint8Array>[];
  let vm: QuasarSvm;

  function createDistributorIx(overrides: Partial<CreateDistributorInstructionInput> = {}) {
    return buildCreateDistributorIx(
      {
        authority: authority.address,
        base: base.address,
        mint: mint.address,
        tokenAccount: authorityTokenAccount,
        distributorVault,
        eventAuthority,
        clawbackReceiver: clawbackReceiver.address,
        distribution,
      },
      overrides,
    );
  }

  function claimIx(
    claim = distribution.claims[0]!,
    overrides: Partial<ClaimInstructionInput> = {},
  ) {
    return buildClaimIx(
      {
        claimant: claimant.address,
        distributor,
        mint: mint.address,
        distributorVault,
        claimantTokenAccount,
        eventAuthority,
      },
      claim,
      overrides,
    );
  }

  function updateIx(overrides: Partial<UpdateDistributorInstructionInput> = {}) {
    return buildUpdateIx(
      {
        authority: authority.address,
        distributor,
        eventAuthority,
        clawbackReceiver: stranger.address,
      },
      overrides,
    );
  }

  function clawbackIx(overrides: Partial<ClawbackInstructionInput> = {}) {
    return buildClawbackIx(
      {
        payer: claimant.address,
        distributorAuthority: authority.address,
        clawbackReceiver: clawbackReceiver.address,
        distributor,
        mint: mint.address,
        distributorVault,
        clawbackReceiverTokenAccount,
        eventAuthority,
      },
      overrides,
    );
  }

  beforeAll(async () => {
    vm = new QuasarSvm();
    await loadProgram(vm);

    [authority, base, clawbackReceiver, stranger, mint, otherMint] = await Promise.all([
      generateKeyPairSigner(),
      generateKeyPairSigner(),
      generateKeyPairSigner(),
      generateKeyPairSigner(),
      generateKeyPairSigner(),
      generateKeyPairSigner(),
    ]);
    claimant = await createKeyPairSignerFromPrivateKeyBytes(
      Uint8Array.from({ length: 32 }, (_, index) => index + 1),
    );

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
    [clawbackReceiverTokenAccount] = await findAssociatedTokenPda({
      owner: clawbackReceiver.address,
      mint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    eventAuthority = await findEventAuthority();

    distribution = buildDistributionFromCsv(
      distributor,
      await Bun.file("tests/fixtures/allocations.csv").text(),
    );

    accounts = [
      createKeyedSystemAccount(authority.address, 10_000_000_000n),
      createKeyedSystemAccount(base.address),
      createKeyedSystemAccount(claimant.address, 10_000_000_000n),
      createKeyedSystemAccount(clawbackReceiver.address, 10_000_000_000n),
      createKeyedSystemAccount(stranger.address, 10_000_000_000n),
      createKeyedMintAccount(mint.address, { decimals: 6 }),
      createKeyedMintAccount(otherMint.address, { decimals: 6 }),
      await createKeyedAssociatedTokenAccount(
        authority.address,
        mint.address,
        distribution.maxTotalClaim * 4n,
      ),
      createKeyedSystemAccount(distributor, 0n),
      await createKeyedAssociatedTokenAccount(distributor, mint.address, 0n),
      createKeyedSystemAccount(eventAuthority, 0n),
    ];

    const created = vm.processInstruction(await createDistributorIx(), accounts);
    expect(created.status.ok, created.logs.join("\n")).toBe(true);
    accounts = created.accounts;
  });

  it("rejects create when claim_timestamp is in the past (ClaimPeriodInPast)", async () => {
    vm.setClock(CLOCK);
    const freshBase = await generateKeyPairSigner();
    const freshDistributor = await findDistributorAddress(freshBase.address);
    const [freshVault] = await findAssociatedTokenPda({
      owner: freshDistributor,
      mint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const result = vm.processInstruction(
      await createDistributorIx({
        base: freshBase.address,
        distributorVault: freshVault,
        claim_timestamp: 50n,
      }),
      [
        ...accounts,
        createKeyedSystemAccount(freshBase.address),
        createKeyedSystemAccount(freshDistributor, 0n),
        await createKeyedAssociatedTokenAccount(freshDistributor, mint.address, 0n),
      ],
    );
    expectCustomError(result, "ClaimPeriodInPast");
  });

  it("rejects create when claim_timestamp is after clawback (ClaimPeriodAfterClawbackPeriod)", async () => {
    vm.setClock(CLOCK);
    const freshBase = await generateKeyPairSigner();
    const freshDistributor = await findDistributorAddress(freshBase.address);
    const [freshVault] = await findAssociatedTokenPda({
      owner: freshDistributor,
      mint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const result = vm.processInstruction(
      await createDistributorIx({
        base: freshBase.address,
        distributorVault: freshVault,
        claim_timestamp: 3_000n,
        clawback_timestamp: 2_000n,
      }),
      [
        ...accounts,
        createKeyedSystemAccount(freshBase.address),
        createKeyedSystemAccount(freshDistributor, 0n),
        await createKeyedAssociatedTokenAccount(freshDistributor, mint.address, 0n),
      ],
    );
    expectCustomError(result, "ClaimPeriodAfterClawbackPeriod");
  });

  it("rejects claim before claim_timestamp (ClaimPeriodNotStarted)", async () => {
    vm.setClock(CLOCK);
    const claimStatus = await findClaimStatusAddress(distributor, claimant.address);
    const result = vm.processInstruction(await claimIx(), [
      ...accounts,
      createKeyedSystemAccount(claimStatus, 0n),
      await createKeyedAssociatedTokenAccount(claimant.address, mint.address, 0n),
    ]);
    expectCustomError(result, "ClaimPeriodNotStarted");
  });

  it("rejects clawback before clawback_timestamp (ClawbackPeriodNotStarted)", async () => {
    vm.setClock({ ...CLOCK, unixTimestamp: CLAIM_TIMESTAMP });
    const result = vm.processInstruction(clawbackIx(), [
      ...accounts,
      await createKeyedAssociatedTokenAccount(clawbackReceiver.address, mint.address, 0n),
    ]);
    expectCustomError(result, "ClawbackPeriodNotStarted");
  });

  it("rejects claim after clawback_timestamp (ClaimPeriodExpired)", async () => {
    vm.setClock({ ...CLOCK, unixTimestamp: CLAWBACK_TIMESTAMP });
    const claimStatus = await findClaimStatusAddress(distributor, claimant.address);
    const result = vm.processInstruction(await claimIx(), [
      ...accounts,
      createKeyedSystemAccount(claimStatus, 0n),
      await createKeyedAssociatedTokenAccount(claimant.address, mint.address, 0n),
    ]);
    expectCustomError(result, "ClaimPeriodExpired");
  });

  it("rejects update from a non-admin (InvalidDistributorAuthority)", () => {
    vm.setClock(CLOCK);
    const result = vm.processInstruction(updateIx({ authority: stranger.address }), accounts);
    expectCustomError(result, "InvalidDistributorAuthority");
  });

  it("rejects clawback with the wrong authority account (InvalidDistributorAuthority)", async () => {
    vm.setClock({ ...CLOCK, unixTimestamp: CLAWBACK_TIMESTAMP });
    const result = vm.processInstruction(clawbackIx({ distributorAuthority: stranger.address }), [
      ...accounts,
      await createKeyedAssociatedTokenAccount(clawbackReceiver.address, mint.address, 0n),
    ]);
    expectCustomError(result, "InvalidDistributorAuthority");
  });

  it("rejects claim with the wrong mint (InvalidDistributorMint)", async () => {
    vm.setClock({ ...CLOCK, unixTimestamp: CLAIM_TIMESTAMP });
    const claimStatus = await findClaimStatusAddress(distributor, claimant.address);
    const [wrongClaimantAta] = await findAssociatedTokenPda({
      owner: claimant.address,
      mint: otherMint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const result = vm.processInstruction(
      await claimIx(distribution.claims[0], {
        mint: otherMint.address,
        claimantTokenAccount: wrongClaimantAta,
      }),
      [
        ...accounts,
        createKeyedSystemAccount(claimStatus, 0n),
        await createKeyedAssociatedTokenAccount(claimant.address, otherMint.address, 0n),
      ],
    );
    expectCustomError(result, "InvalidDistributorMint");
  });

  it("rejects an invalid merkle proof (InvalidProof)", async () => {
    vm.setClock({ ...CLOCK, unixTimestamp: CLAIM_TIMESTAMP });
    const claimStatus = await findClaimStatusAddress(distributor, claimant.address);
    const claim = distribution.claims[0]!;
    const result = vm.processInstruction(await claimIx({ ...claim, amount: claim.amount + 1n }), [
      ...accounts,
      createKeyedSystemAccount(claimStatus, 0n),
      await createKeyedAssociatedTokenAccount(claimant.address, mint.address, 0n),
    ]);
    expectCustomError(result, "InvalidProof");
  });

  it("rejects clawback with the wrong receiver (InvalidClawbackReceiver)", async () => {
    vm.setClock({ ...CLOCK, unixTimestamp: CLAWBACK_TIMESTAMP });
    const [strangerAta] = await findAssociatedTokenPda({
      owner: stranger.address,
      mint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const result = vm.processInstruction(
      clawbackIx({
        clawbackReceiver: stranger.address,
        clawbackReceiverTokenAccount: strangerAta,
      }),
      [...accounts, await createKeyedAssociatedTokenAccount(stranger.address, mint.address, 0n)],
    );
    expectCustomError(result, "InvalidClawbackReceiver");
  });

  it("rejects claim that would exceed max_claim (MaxAmountClaimedReached)", async () => {
    vm.setClock(CLOCK);
    const freshBase = await generateKeyPairSigner();
    const freshDistributor = await findDistributorAddress(freshBase.address);
    const [freshVault] = await findAssociatedTokenPda({
      owner: freshDistributor,
      mint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const freshDistribution = buildDistribution(freshDistributor, [
      { claimant: claimant.address, amount: 5_000_000n },
    ]);
    const created = vm.processInstruction(
      await createDistributorIx({
        base: freshBase.address,
        distributorVault: freshVault,
        max_total_claim: 1n,
        max_nodes: 1n,
        root: freshDistribution.root,
      }),
      [
        ...accounts,
        createKeyedSystemAccount(freshBase.address),
        createKeyedSystemAccount(freshDistributor, 0n),
        await createKeyedAssociatedTokenAccount(freshDistributor, mint.address, 0n),
      ],
    );
    expect(created.status.ok, created.logs.join("\n")).toBe(true);
    expect(created.logs.some((log) => log.includes("failed"))).toBe(false);

    vm.setClock({ ...CLOCK, unixTimestamp: CLAIM_TIMESTAMP });
    const claimStatus = await findClaimStatusAddress(freshDistributor, claimant.address);
    const claim = freshDistribution.claims[0]!;
    const result = vm.processInstruction(
      await buildClaimIx(
        {
          claimant: claimant.address,
          distributor: freshDistributor,
          mint: mint.address,
          distributorVault: freshVault,
          claimantTokenAccount,
          eventAuthority,
        },
        claim,
      ),
      [
        ...created.accounts,
        createKeyedSystemAccount(claimStatus, 0n),
        await createKeyedAssociatedTokenAccount(claimant.address, mint.address, 0n),
      ],
    );
    expectCustomError(result, "MaxAmountClaimedReached");
  });

  it("rejects claim that would exceed max_nodes (MaxNodesClaimedReached)", async () => {
    vm.setClock(CLOCK);
    const freshBase = await generateKeyPairSigner();
    const freshDistributor = await findDistributorAddress(freshBase.address);
    const [freshVault] = await findAssociatedTokenPda({
      owner: freshDistributor,
      mint: mint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const freshDistribution = buildDistribution(freshDistributor, [
      { claimant: claimant.address, amount: 5_000_000n },
    ]);
    const created = vm.processInstruction(
      await createDistributorIx({
        base: freshBase.address,
        distributorVault: freshVault,
        max_total_claim: freshDistribution.maxTotalClaim,
        max_nodes: 0n,
        root: freshDistribution.root,
      }),
      [
        ...accounts,
        createKeyedSystemAccount(freshBase.address),
        createKeyedSystemAccount(freshDistributor, 0n),
        await createKeyedAssociatedTokenAccount(freshDistributor, mint.address, 0n),
      ],
    );
    expect(created.status.ok, created.logs.join("\n")).toBe(true);
    expect(created.logs.some((log) => log.includes("failed"))).toBe(false);

    vm.setClock({ ...CLOCK, unixTimestamp: CLAIM_TIMESTAMP });
    const claimStatus = await findClaimStatusAddress(freshDistributor, claimant.address);
    const claim = freshDistribution.claims[0]!;
    const result = vm.processInstruction(
      await buildClaimIx(
        {
          claimant: claimant.address,
          distributor: freshDistributor,
          mint: mint.address,
          distributorVault: freshVault,
          claimantTokenAccount,
          eventAuthority,
        },
        claim,
      ),
      [
        ...created.accounts,
        createKeyedSystemAccount(claimStatus, 0n),
        await createKeyedAssociatedTokenAccount(claimant.address, mint.address, 0n),
      ],
    );
    expectCustomError(result, "MaxNodesClaimedReached");
  });

  it("rejects clawback with the wrong mint (InvalidDistributorMint)", async () => {
    vm.setClock({ ...CLOCK, unixTimestamp: CLAWBACK_TIMESTAMP });
    const [wrongReceiverAta] = await findAssociatedTokenPda({
      owner: clawbackReceiver.address,
      mint: otherMint.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const result = vm.processInstruction(
      clawbackIx({
        mint: otherMint.address,
        clawbackReceiverTokenAccount: wrongReceiverAta,
      }),
      [
        ...accounts,
        await createKeyedAssociatedTokenAccount(clawbackReceiver.address, otherMint.address, 0n),
      ],
    );
    expectCustomError(result, "InvalidDistributorMint");
  });

  describe("after clawback", () => {
    beforeAll(async () => {
      vm.setClock({ ...CLOCK, unixTimestamp: CLAWBACK_TIMESTAMP });
      const result = vm.processInstruction(clawbackIx(), [
        ...accounts,
        await createKeyedAssociatedTokenAccount(clawbackReceiver.address, mint.address, 0n),
      ]);
      expect(result.status.ok, result.logs.join("\n")).toBe(true);
      expect(result.logs.some((log) => log.includes("failed"))).toBe(false);
      // Clawback closes the vault; restore a token-program-owned vault for later account validation.
      accounts = [
        ...result.accounts.filter((account) => account.address !== distributorVault),
        await createKeyedAssociatedTokenAccount(distributor, mint.address, 0n),
      ];
    });

    it("rejects update after clawback (DistributorAlreadyClawedBack)", () => {
      const result = vm.processInstruction(updateIx(), accounts);
      expectCustomError(result, "DistributorAlreadyClawedBack");
    });

    it("rejects claim after clawback (DistributorAlreadyClawedBack)", async () => {
      const claimStatus = await findClaimStatusAddress(distributor, claimant.address);
      // Clock before clawback_timestamp so ClaimPeriodExpired does not fire first.
      vm.setClock({ ...CLOCK, unixTimestamp: CLAIM_TIMESTAMP });
      const result = vm.processInstruction(await claimIx(), [
        ...accounts,
        createKeyedSystemAccount(claimStatus, 0n),
        await createKeyedAssociatedTokenAccount(claimant.address, mint.address, 0n),
      ]);
      expectCustomError(result, "DistributorAlreadyClawedBack");
    });

    it("rejects a second clawback (DistributorAlreadyClawedBack)", async () => {
      vm.setClock({ ...CLOCK, unixTimestamp: CLAWBACK_TIMESTAMP });
      const result = vm.processInstruction(clawbackIx(), [
        ...accounts,
        await createKeyedAssociatedTokenAccount(clawbackReceiver.address, mint.address, 0n),
      ]);
      expectCustomError(result, "DistributorAlreadyClawedBack");
    });
  });
});
