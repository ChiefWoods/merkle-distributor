use quasar_lang::{cpi::Seed, prelude::*, sysvars::Sysvar};
use quasar_spl::prelude::*;

use crate::{
    errors::MerkleDistributorError, events::ClawedBack, states::Distributor, EventAuthority,
    MerkleDistributor,
};

#[derive(Accounts)]
pub struct Clawback {
    #[account(mut)]
    pub payer: Signer,
    #[account(mut)]
    pub authority: UncheckedAccount,
    pub clawback_receiver: UncheckedAccount,
    #[account(
        mut,
        has_one(authority) @ MerkleDistributorError::InvalidDistributorAuthority,
        has_one(clawback_receiver) @ MerkleDistributorError::InvalidClawbackReceiver,
        has_one(mint) @ MerkleDistributorError::InvalidDistributorMint
    )]
    pub distributor: Account<Distributor>,
    pub mint: Account<Mint>,
    #[account(mut)]
    pub distributor_vault: Account<Token>,
    #[account(
        init(idempotent),
        payer = payer,
        associated_token(
            mint = mint,
            authority = clawback_receiver,
            token_program = token_program,
        )
    )]
    pub clawback_receiver_token_account: Account<Token>,
    pub system_program: Program<SystemProgram>,
    pub token_program: Program<TokenProgram>,
    pub associated_token_program: Program<AssociatedTokenProgram>,
    pub event_authority: EventAuthority,
    pub program: Program<MerkleDistributor>,
}

impl Clawback {
    /// 1. Validate claim period has started.
    /// 2. Validate distributor has not clawed back.
    /// 3. Set distributor has clawed back.
    /// 4. Transfer tokens from distributor vault to clawback receiver.
    /// 5. Close distributor vault.
    /// 6. Emit clawed back event.
    #[inline(always)]
    pub fn handler(&mut self) -> Result<(), ProgramError> {
        let Clock {
            unix_timestamp: current_timestamp,
            slot,
            ..
        } = Clock::get()?;

        let distributor = &mut self.distributor;

        require!(
            current_timestamp >= distributor.clawback_timestamp(),
            MerkleDistributorError::ClawbackPeriodNotStarted
        );

        require!(
            distributor.has_clawed_back.is_false(),
            MerkleDistributorError::DistributorAlreadyClawedBack
        );

        distributor.has_clawed_back.set(true);

        let clawback_amount = self.distributor_vault.amount();

        let distributor_bump = [distributor.bump];

        let distributor_signer_seeds = [
            Seed::from(Distributor::SEED_PREFIX as &[u8]),
            Seed::from(distributor.base.as_ref()),
            Seed::from(distributor_bump.as_ref()),
        ];

        self.token_program
            .transfer_checked(
                self.distributor_vault.to_account_view(),
                self.mint.to_account_view(),
                self.clawback_receiver_token_account.to_account_view(),
                distributor.to_account_view(),
                clawback_amount,
                self.mint.decimals(),
            )
            .invoke_signed(&distributor_signer_seeds)?;

        self.token_program
            .close_account(
                self.distributor_vault.to_account_view(),
                self.authority.to_account_view(),
                distributor.to_account_view(),
            )
            .invoke_signed(&distributor_signer_seeds)?;

        emit_cpi!(ClawedBack {
            distributor: *distributor.address(),
            clawback_amount,
            slot: slot.into(),
        })?;

        Ok(())
    }
}
