use quasar_lang::prelude::*;
use solana_nostd_sha256::hashv;

pub fn verify(proof: &[[u8; 32]], root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;
    for proof_element in proof.into_iter() {
        if computed_hash <= *proof_element {
            // Hash(current computed hash + current element of the proof)
            computed_hash = hashv(&[&[1u8], &computed_hash, proof_element]);
        } else {
            // Hash(current element of the proof + current computed hash)
            computed_hash = hashv(&[&[1u8], proof_element, &computed_hash]);
        }
    }
    computed_hash == root
}

pub fn get_leaf_hash(distributor: &Address, claimant: &Address, amount: u64) -> [u8; 32] {
    hashv(&[
        &[0u8],
        distributor.as_ref(),
        claimant.as_ref(),
        &amount.to_le_bytes(),
    ])
}
