use quasar_lang::{cpi::Seed, prelude::*, sysvars::Sysvar};
use quasar_spl::prelude::*;

use crate::{
    errors::MerkleDistributorError,
    events::Claimed,
    states::{ClaimStatus, ClaimStatusInner, Distributor},
    utils::{get_leaf_hash, verify},
    EventAuthority, MerkleDistributor,
};

#[derive(Accounts)]
pub struct Claim {
    #[account(mut)]
    pub claimant: Signer,
    #[account(
        mut,
        has_one(mint) @ MerkleDistributorError::InvalidDistributorMint
    )]
    pub distributor: Account<Distributor>,
    #[account(
        mut,
        init,
        payer = claimant,
        address = ClaimStatus::seeds(distributor.address(), claimant.address()),
    )]
    pub claim_status: Account<ClaimStatus>,
    pub mint: Account<Mint>,
    #[account(
        mut,
        associated_token(
            mint = mint,
            authority = distributor,
            token_program = token_program,
        )
    )]
    pub distributor_vault: Account<Token>,
    #[account(
        init(idempotent),
        payer = claimant,
        associated_token(
            mint = mint,
            authority = claimant,
            token_program = token_program,
        )
    )]
    pub claimant_token_account: Account<Token>,
    pub system_program: Program<SystemProgram>,
    pub token_program: Program<TokenProgram>,
    pub associated_token_program: Program<AssociatedTokenProgram>,
    pub event_authority: EventAuthority,
    pub program: Program<MerkleDistributor>,
}

impl Claim {
    /// 1. Validate claim period has started.
    /// 2. Validate distributor has not clawed back.
    /// 3. Validate claim period has not expired.
    /// 4. Verify proof.
    /// 5. Create claim status account.
    /// 6. Update distributor total claimed.
    /// 7. Transfer tokens from distributor vault to claimant.
    #[inline(always)]
    pub fn handler(
        &mut self,
        bumps: &ClaimBumps,
        amount: u64,
        proof: &[[u8; 32]],
    ) -> Result<(), ProgramError> {
        let Clock {
            unix_timestamp: current_timestamp,
            slot,
            ..
        } = Clock::get()?;

        require!(amount > 0, MerkleDistributorError::NothingToClaim);

        let distributor = &mut self.distributor;

        require!(
            current_timestamp >= distributor.claim_timestamp(),
            MerkleDistributorError::ClaimPeriodNotStarted
        );

        require!(
            distributor.has_clawed_back.is_false(),
            MerkleDistributorError::DistributorAlreadyClawedBack
        );

        require!(
            current_timestamp < distributor.clawback_timestamp(),
            MerkleDistributorError::ClaimPeriodExpired
        );

        let leaf = get_leaf_hash(&distributor.address(), &self.claimant.address(), amount);

        require!(
            verify(proof, distributor.root, leaf),
            MerkleDistributorError::InvalidProof
        );

        self.claim_status.set_inner(ClaimStatusInner {
            distributor: *distributor.address(),
            claimant: *self.claimant.address(),
            claimed_amount: amount,
            bump: bumps.claim_status,
        });

        distributor.total_claimed = distributor
            .total_claimed
            .checked_add(amount)
            .ok_or(MerkleDistributorError::ArithmeticOverflow)?;

        require!(
            distributor.total_claimed <= distributor.max_claim,
            MerkleDistributorError::MaxAmountClaimedReached
        );

        require!(
            distributor.nodes_claimed < distributor.max_nodes,
            MerkleDistributorError::MaxNodesClaimedReached
        );

        distributor.nodes_claimed = distributor
            .nodes_claimed
            .checked_add(1)
            .ok_or(MerkleDistributorError::ArithmeticOverflow)?;

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
                self.claimant_token_account.to_account_view(),
                distributor.to_account_view(),
                amount,
                self.mint.decimals(),
            )
            .invoke_signed(&distributor_signer_seeds)?;

        emit_cpi!(Claimed {
            claim_amount: amount,
            claimant: *self.claimant.address(),
            distributor: *distributor.address(),
            slot: slot.into(),
        })?;

        Ok(())
    }
}
