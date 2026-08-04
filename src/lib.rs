#![cfg_attr(not(test), no_std)]

use quasar_lang::prelude::*;

mod errors;
mod events;
mod instructions;
mod states;
mod utils;
use instructions::*;

declare_id!("Cq8jguwku3Adx2N5gAzvDdkRoZ3DoyTPpPeWC6cpcW1r");

#[program]
mod merkle_distributor {
    use super::*;

    #[instruction(discriminator = 0)]
    pub fn create_distributor(
        ctx: Ctx<CreateDistributor>,
        claim_timestamp: i64,
        clawback_timestamp: i64,
        clawback_receiver: Address,
        max_total_claim: u64,
        max_nodes: u64,
        root: [u8; 32],
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler(
            &ctx.bumps,
            claim_timestamp,
            clawback_timestamp,
            clawback_receiver,
            max_total_claim,
            max_nodes,
            root,
        )
    }

    #[instruction(discriminator = 1)]
    pub fn update_distributor(
        ctx: Ctx<UpdateDistributor>,
        clawback_receiver: Address,
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler(clawback_receiver)
    }

    #[instruction(discriminator = 2)]
    pub fn claim(
        ctx: Ctx<Claim>,
        amount: u64,
        proof: Vec<[u8; 32], 64>,
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler(&ctx.bumps, amount, proof)
    }

    #[instruction(discriminator = 3)]
    pub fn clawback(ctx: Ctx<Clawback>) -> Result<(), ProgramError> {
        ctx.accounts.handler()
    }
}
