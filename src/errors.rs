use quasar_lang::prelude::*;

#[error_code]
pub enum MerkleDistributorError {
    /// Claim period must be greater than the current timestamp
    ClaimPeriodInPast,
    /// Claim period must be before the clawback period
    ClaimPeriodAfterClawbackPeriod,
    /// Claim period has not started
    ClaimPeriodNotStarted,
    /// Clawback period has not started
    ClawbackPeriodNotStarted,
    /// Claim period has expired
    ClaimPeriodExpired,
    /// Authority is not the owner of the distributor
    InvalidDistributorAuthority,
    /// Distirbutor mint does not match
    InvalidDistributorMint,
    /// Leaf is not in the Merkle tree
    InvalidProof,
    /// Distributor has already clawed back tokens
    DistributorAlreadyClawedBack,
    /// Max distributor claim has been reached
    MaxAmountClaimedReached,
    /// Max nodes claim has been reached
    MaxNodesClaimedReached,
    /// Clawback receiver does not match
    InvalidClawbackReceiver,
    /// Claim amount must be greater than 0
    NothingToClaim,
    /// Max claim must be greater than 0
    InvalidMaxClaim,
    /// Max nodes must be greater than 0
    InvalidMaxNodes,
    /// Mint must not have a freeze authority
    MintFreezeAuthoritySet,
    /// Arithmetic overflow
    ArithmeticOverflow,
}
