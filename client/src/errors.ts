/** Error thrown by the Merkle distributor TypeScript client for invalid inputs. */
export class MerkleDistributorClientError extends Error {
  override readonly name = "MerkleDistributorClientError";

  constructor(message: string) {
    super(message);
  }
}
