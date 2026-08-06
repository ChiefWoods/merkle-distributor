use quasar_lang::{prelude::*, sysvars::Sysvar};

use crate::{
    errors::MerkleDistributorError, events::DistributorUpdated, states::Distributor,
    EventAuthority, MerkleDistributor,
};

#[derive(Accounts)]
pub struct UpdateDistributor {
    pub authority: Signer,
    #[account(
        mut,
        has_one(authority) @ MerkleDistributorError::InvalidDistributorAuthority
    )]
    pub distributor: Account<Distributor>,
    pub event_authority: EventAuthority,
    pub program: Program<MerkleDistributor>,
}

impl UpdateDistributor {
    /// 1. Validate distributor authority.
    /// 2. Validate distributor has not clawed back.
    /// 3. Update distributor clawback receiver.
    #[inline(always)]
    pub fn handler(&mut self, clawback_receiver: Address) -> Result<(), ProgramError> {
        let Clock { slot, .. } = Clock::get()?;

        let distributor = &mut self.distributor;

        require!(
            distributor.has_clawed_back.is_false(),
            MerkleDistributorError::DistributorAlreadyClawedBack
        );

        distributor.clawback_receiver = clawback_receiver;

        emit_cpi!(DistributorUpdated {
            distributor: *self.distributor.address(),
            clawback_receiver,
            slot: slot.into(),
        })?;

        Ok(())
    }
}
