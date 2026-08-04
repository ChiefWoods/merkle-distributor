use quasar_lang::prelude::*;

#[account(discriminator = 1, set_inner)]
#[seeds(b"distributor", base: Address)]
pub struct Distributor {
    pub base: Address,
    pub authority: Address,
    pub mint: Address,
    pub claim_timestamp: i64,
    pub clawback_timestamp: i64,
    pub clawback_receiver: Address,
    pub total_claimed: u64,
    pub max_claim: u64,
    pub nodes_claimed: u64,
    pub max_nodes: u64,
    pub root: [u8; 32],
    pub has_clawed_back: bool,
    pub bump: u8,
}
