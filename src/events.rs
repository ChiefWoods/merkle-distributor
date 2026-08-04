use quasar_lang::prelude::*;

#[event(discriminator = 0)]
pub struct DistributorCreated {
    pub authority: Address,
    pub distributor: Address,
    pub mint: Address,
    pub claim_timestamp: i64,
    pub clawback_timestamp: i64,
    pub clawback_receiver: Address,
    pub max_claim: u64,
    pub max_nodes: u64,
    // root not included, byte arrays not supported
    pub slot: u64,
}

#[event(discriminator = 1)]
pub struct DistributorUpdated {
    pub distributor: Address,
    pub clawback_receiver: Address,
    pub slot: u64,
}

#[event(discriminator = 2)]
pub struct Claimed {
    pub claimant: Address,
    pub distributor: Address,
    pub claim_amount: u64,
    pub slot: u64,
}

#[event(discriminator = 3)]
pub struct ClawedBack {
    pub distributor: Address,
    pub clawback_amount: u64,
    pub slot: u64,
}
