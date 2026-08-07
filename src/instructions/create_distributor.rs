use quasar_lang::{prelude::*, sysvars::Sysvar};
use quasar_spl::prelude::*;

use crate::{
    errors::MerkleDistributorError,
    events::DistributorCreated,
    states::{Distributor, DistributorInner},
    EventAuthority, MerkleDistributor,
};

#[derive(Accounts)]
pub struct CreateDistributor {
    #[account(mut)]
    pub authority: Signer,
    // passed as account, seeds() cannot use from instruction
    pub base: UncheckedAccount,
    #[account(
        mut,
        init,
        payer = authority,
        address = Distributor::seeds(base.address()),
    )]
    pub distributor: Account<Distributor>,
    // freeze authority checked in handler
    pub mint: Account<Mint>,
    #[account(
        mut,
        associated_token(
            mint = mint,
            authority = authority,
            token_program = token_program,
        )
    )]
    pub token_account: Account<Token>,
    #[account(
        init(idempotent),
        payer = authority,
        associated_token(
            mint = mint,
            authority = distributor,
            token_program = token_program,
        )
    )]
    pub distributor_vault: Account<Token>,
    pub system_program: Program<SystemProgram>,
    pub token_program: Program<TokenProgram>,
    pub associated_token_program: Program<AssociatedTokenProgram>,
    pub event_authority: EventAuthority,
    pub program: Program<MerkleDistributor>,
}

impl CreateDistributor {
    /// 1. Validate claim and clawback periods.
    /// 2. Validate merkle tree configuration.
    /// 3. Validate mint is not freezeable.
    /// 4. Creates a new distributor account.
    #[inline(always)]
    pub fn handler(
        &mut self,
        bumps: &CreateDistributorBumps,
        claim_timestamp: i64,
        clawback_timestamp: i64,
        clawback_receiver: Address,
        max_claim: u64,
        max_nodes: u64,
        root: [u8; 32],
    ) -> Result<(), ProgramError> {
        let Clock {
            unix_timestamp: current_timestamp,
            slot,
            ..
        } = Clock::get()?;

        require!(
            current_timestamp <= claim_timestamp,
            MerkleDistributorError::ClaimPeriodInPast
        );
        require!(
            claim_timestamp < clawback_timestamp,
            MerkleDistributorError::ClaimPeriodAfterClawbackPeriod
        );
        require!(max_claim > 0, MerkleDistributorError::InvalidMaxClaim);
        require!(max_nodes > 0, MerkleDistributorError::InvalidMaxNodes);
        require!(
            self.mint.freeze_authority().is_none(),
            MerkleDistributorError::MintFreezeAuthoritySet
        );

        self.token_program
            .transfer_checked(
                self.token_account.to_account_view(),
                self.mint.to_account_view(),
                self.distributor_vault.to_account_view(),
                &self.authority,
                max_claim,
                self.mint.decimals(),
            )
            .invoke()?;

        self.distributor.set_inner(DistributorInner {
            base: *self.base.address(),
            authority: *self.authority.address(),
            mint: *self.mint.address(),
            claim_timestamp,
            clawback_timestamp,
            clawback_receiver,
            total_claimed: 0,
            max_claim,
            nodes_claimed: 0,
            max_nodes,
            root,
            has_clawed_back: false,
            bump: bumps.distributor,
        });

        emit_cpi!(DistributorCreated {
            authority: *self.authority.address(),
            distributor: *self.distributor.address(),
            mint: *self.mint.address(),
            claim_timestamp,
            clawback_timestamp,
            clawback_receiver,
            max_claim,
            max_nodes,
            slot: slot.into(),
        })?;

        Ok(())
    }
}
