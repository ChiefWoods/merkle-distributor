#![cfg_attr(not(test), no_std)]

use quasar_lang::prelude::*;

mod errors;
mod instructions;
mod state;
use instructions::*;

declare_id!("Cq8jguwku3Adx2N5gAzvDdkRoZ3DoyTPpPeWC6cpcW1r");

#[program]
mod merkle_distributor {
    use super::*;

    #[instruction]
    pub fn initialize(ctx: Ctx<Initialize>) -> Result<(), ProgramError> {
        ctx.accounts.initialize()
    }
}
