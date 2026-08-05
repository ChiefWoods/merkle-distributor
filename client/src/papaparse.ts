import type { Allocation } from "./types.js";
import { MerkleDistributorClientError } from "./errors.js";
import { assertAmount, parseAddress } from "./utils.js";

const PAPAPARSE_MODULE: string = "papaparse";

interface ParseError {
  message: string;
}

interface ParseResult {
  data: string[][];
  errors: ParseError[];
}

interface PapaParse {
  parse(input: string, config?: { skipEmptyLines?: boolean | "greedy" }): ParseResult;
}

const { default: Papa } = (await import(PAPAPARSE_MODULE)) as { default: PapaParse };

/** Parses the required `claimant,amount` CSV allocation format. */
export function parseAllocationsCsv(csv: string): Allocation[] {
  const parsed = Papa.parse(csv, { skipEmptyLines: "greedy" });
  if (parsed.errors.length > 0) {
    throw new MerkleDistributorClientError(`invalid CSV: ${parsed.errors[0].message}`);
  }

  const [header, ...rows] = parsed.data;
  if (
    header === undefined ||
    header.length !== 2 ||
    header[0].replace(/^\uFEFF/, "") !== "claimant" ||
    header[1] !== "amount"
  ) {
    throw new MerkleDistributorClientError('CSV must start with the header "claimant,amount"');
  }
  if (rows.length === 0) {
    throw new MerkleDistributorClientError("CSV must contain at least one allocation");
  }

  const claimants = new Set<string>();
  return rows.map((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== 2 || row[0].trim() === "" || row[1].trim() === "") {
      throw new MerkleDistributorClientError(`row ${rowNumber} must contain a claimant and amount`);
    }

    const claimant = parseAddress(row[0].trim(), `row ${rowNumber} claimant`);
    if (claimants.has(claimant)) {
      throw new MerkleDistributorClientError(`duplicate claimant at row ${rowNumber}: ${claimant}`);
    }
    claimants.add(claimant);

    return { claimant, amount: parseAmount(row[1].trim(), `row ${rowNumber} amount`) };
  });
}

function parseAmount(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new MerkleDistributorClientError(`${field} must be an unsigned decimal integer`);
  }

  return assertAmount(BigInt(value), field);
}
