# Merkle Distributor

Merkle proof–gated token distributor for airdrops and claim campaigns.

[Source Repository](https://github.com/ChiefWoods/merkle-distributor)

## How It Works

Allocations are expressed as a CSV with a `claimant,amount` header - each row a Solana address and an unsigned integer amount in base units. Positive amounts only; duplicate claimants are rejected. Row order becomes leaf order.

The TypeScript client (`buildDistributionFromCsv`) binds that list to a distributor address: every row is encoded as `distributor || claimant || amount` (u64 little-endian), hashed into a leaf, and folded into a Merkle tree. The resulting artifact carries the root, `maxTotalClaim` (the sum of all amounts), and a proof per claimant.

On-chain, the distributor is initialized with that root and a vault funded to `maxTotalClaim`. A claimant redeems once by presenting their amount and Merkle proof; after the clawback window, any remainder can be clawed back by the distributor authority.

## Built With

### Languages

- [![Quasar](https://img.shields.io/badge/Quasar-0e0d11?style=for-the-badge)](https://quasar-lang.com/)

## Getting Started

### Prerequisites

1. Update your Solana CLI

```sh
agave-install update
```

### Setup

1. Clone the repository

```sh
git clone https://github.com/ChiefWoods/merkle-distributor.git
```

2. Resync your program id

```sh
quasar keys sync
```

3. Build the program

```sh
quasar build
```

#### Testing

Run all tests.

```sh
quasar test
```

## Issues

View the [open issues](https://github.com/ChiefWoods/merkle-distributor/issues) for a full list of proposed features and known bugs.

## Acknowledgements

### Resources

- [Shields.io](https://shields.io/)

## Contact

[chii.yuen@hotmail.com](mailto:chii.yuen@hotmail.com)
