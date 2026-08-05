import { address, getAddressEncoder, type Address } from "@solana/kit";

import { MerkleDistributorClientError } from "./errors.js";

export const MAX_U64 = (1n << 64n) - 1n;
export const ADDRESS_ENCODER = getAddressEncoder();

export function parseAddress(value: string, field: string): Address {
  try {
    return address(value);
  } catch {
    throw new MerkleDistributorClientError(`${field} is not a valid Solana address`);
  }
}

export function assertAmount(value: bigint, field: string): bigint {
  if (value <= 0n || value > MAX_U64) {
    throw new MerkleDistributorClientError(`${field} must be greater than zero and fit in u64`);
  }
  return value;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function toHex(value: Uint8Array): string {
  return `0x${Buffer.from(value).toString("hex")}`;
}
