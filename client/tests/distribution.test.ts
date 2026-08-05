import { address } from "@solana/kit";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  buildDistribution,
  buildDistributionFromCsv,
  encodeAllocation,
  getClaimProof,
  MerkleDistributorClientError,
  parseAllocationsCsv,
  serializeDistribution,
  verifyProof,
} from "../src/index.js";

const distributor = address("11111111111111111111111111111111");
const claimantOne = address("22222222222222222222222222222222222222222222");
const claimantTwo = address("33333333333333333333333333333333333333333333");
const claimantThree = address("44444444444444444444444444444444444444444444");

describe("Merkle distributor client", () => {
  it("encodes a distributor, claimant, and amount as the on-chain leaf preimage", () => {
    const bytes = encodeAllocation(distributor, claimantOne, 42n);

    expect(bytes).toHaveLength(72);
    expect(Array.from(bytes.subarray(64))).toEqual([42, 0, 0, 0, 0, 0, 0, 0]);
    expect(bytes.subarray(0, 32)).not.toEqual(bytes.subarray(32, 64));
  });

  it("parses fixture CSV rows without changing their input order", async () => {
    const csv = await readFile(new URL("./fixtures/allocations.csv", import.meta.url), "utf8");
    const allocations = parseAllocationsCsv(csv);

    expect(allocations).toEqual([
      { claimant: claimantOne, amount: 5_000_000n },
      { claimant: claimantTwo, amount: 10_000_000n },
      { claimant: claimantThree, amount: 15_000_000n },
    ]);
  });

  it("rejects a duplicate claimant in the CSV", () => {
    expect(() =>
      parseAllocationsCsv(`claimant,amount\n${claimantOne},5\n${claimantOne},10`),
    ).toThrow(MerkleDistributorClientError);
  });

  it("rejects a missing CSV header", () => {
    expect(() => parseAllocationsCsv(`${claimantOne},5`)).toThrow(MerkleDistributorClientError);
  });

  it("rejects a blank CSV field", () => {
    expect(() => parseAllocationsCsv(`claimant,amount\n${claimantOne},`)).toThrow(
      MerkleDistributorClientError,
    );
  });

  it("rejects a malformed claimant address", () => {
    expect(() => parseAllocationsCsv(`claimant,amount\nnot-a-pubkey,5`)).toThrow(
      MerkleDistributorClientError,
    );
  });

  it("rejects a non-integer amount", () => {
    expect(() => parseAllocationsCsv(`claimant,amount\n${claimantOne},1.5`)).toThrow(
      MerkleDistributorClientError,
    );
  });

  it("rejects a negative amount", () => {
    expect(() => parseAllocationsCsv(`claimant,amount\n${claimantOne},-1`)).toThrow(
      MerkleDistributorClientError,
    );
  });

  it("rejects a zero amount", () => {
    expect(() => parseAllocationsCsv(`claimant,amount\n${claimantOne},0`)).toThrow(
      MerkleDistributorClientError,
    );
  });

  it("rejects an amount that exceeds u64", () => {
    expect(() =>
      parseAllocationsCsv(`claimant,amount\n${claimantOne},18446744073709551616`),
    ).toThrow(MerkleDistributorClientError);
  });

  it("builds a distribution directly from CSV text", () => {
    const distribution = buildDistributionFromCsv(
      distributor,
      `claimant,amount\n${claimantOne},5\n${claimantTwo},10`,
    );

    expect(distribution.maxTotalClaim).toBe(15n);
    expect(distribution.claims.map((claim) => claim.claimant)).toEqual([claimantOne, claimantTwo]);
  });

  it("builds a deterministic root and proofs for a fixed allocation set", () => {
    const distribution = buildDistribution(distributor, [
      { claimant: claimantOne, amount: 5n },
      { claimant: claimantTwo, amount: 10n },
      { claimant: claimantThree, amount: 15n },
    ]);

    expect(Buffer.from(distribution.root).toString("hex")).toBe(
      "53806a4d3c5fcfc516edb0e384b05d67e010d538ddb94a89a2f927697ffa0376",
    );
    expect(Buffer.from(distribution.claims[0].leaf).toString("hex")).toBe(
      "98a8fe1c704f46d2f86fd3fbed670b762e65d0af27b3245d4b97677323cdb3a7",
    );
    expect(distribution.claims[0].proof.map((node) => Buffer.from(node).toString("hex"))).toEqual([
      "7c542abf3d39bea82a20de9361d8a8b12c9219f3e024df7d358a1c5dd914d2cc",
      "4e0d51996f78e66cbcfaf07a6f13ac766762f28d8ce6913f1d39837c3655d6d2",
    ]);
    expect(distribution.claims[2].proof.map((node) => Buffer.from(node).toString("hex"))).toEqual([
      "4c31cf68dddd3a6fa0188476d76cdb3f710efd3f1841518868527c0ba870b67a",
    ]);
    for (const claim of distribution.claims) {
      expect(verifyProof(distribution.root, claim.leaf, claim.proof)).toBe(true);
    }
  });

  it("builds verifiable proofs for an odd number of allocations", () => {
    const distribution = buildDistribution(distributor, [
      { claimant: claimantOne, amount: 5n },
      { claimant: claimantTwo, amount: 10n },
      { claimant: claimantThree, amount: 15n },
    ]);

    expect(distribution.maxTotalClaim).toBe(30n);
    expect(distribution.claims).toHaveLength(3);
    expect(distribution.claims[2].proof).toHaveLength(1);
    expect(
      verifyProof(distribution.root, distribution.claims[2].leaf, distribution.claims[2].proof),
    ).toBe(true);
    expect(getClaimProof(distribution, claimantTwo)).toEqual(distribution.claims[1].proof);
  });

  it("serializes an artifact without losing large allocation amounts", () => {
    const distribution = buildDistribution(distributor, [
      { claimant: claimantOne, amount: 9_007_199_254_740_993n },
    ]);

    expect(JSON.parse(serializeDistribution(distribution))).toMatchObject({
      distributor,
      maxTotalClaim: "9007199254740993",
      claims: [{ claimant: claimantOne, amount: "9007199254740993", proof: [] }],
    });
  });
});
