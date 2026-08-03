import { generateKeyPairSigner } from "@solana/kit";
import { AccountRole, address } from "@solana/kit";
import { describe, it, expect } from "vitest";
import { QuasarSvm, createKeyedSystemAccount } from "@blueshift-gg/quasar-svm/kit";
import { readFile } from "node:fs/promises";

describe.concurrent("MerkleDistributor Program", async () => {
  it("initializes", async () => {
    const idl = JSON.parse(await readFile("target/idl/merkle_distributor.json", "utf8")) as { address: string };
    const programAddress = address(idl.address);
    const vm = new QuasarSvm();
    vm.addProgram(programAddress, await readFile("target/deploy/merkle_distributor.so"));

    const payer = await generateKeyPairSigner();

    const initializeInstruction = {
      programAddress,
      accounts: [
        { address: payer.address, role: AccountRole.WRITABLE_SIGNER },
        { address: address("11111111111111111111111111111111"), role: AccountRole.READONLY },
      ],
      data: Uint8Array.from([0]),
    };

    const result = vm.processInstruction(initializeInstruction, [
      createKeyedSystemAccount(payer.address),
    ]);

    expect(result.status.ok, `initialize failed:\n${result.logs.join("\n")}`).toBe(true);
    });
});
