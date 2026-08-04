use quasar_lang::prelude::*;

#[account(discriminator = 2, set_inner)]
#[seeds(b"claim_status", distributor: Address, claimant: Address)]
pub struct ClaimStatus {
    pub distributor: Address,
    pub claimant: Address,
    pub claimed_amount: u64,
    pub bump: u8,
}
