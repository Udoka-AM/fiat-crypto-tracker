use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{delegate, ephemeral, undelegate};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use std::str::FromStr; // Required to parse the validator key string

declare_id!("2Q4J9MoBr6eM8jBBzPcDbSTfG7rKLsm68mYDDLfDZ5kE");

#[program]
#[ephemeral] 
pub mod exchange_rate_tracker {
    use super::*;

    // PDA initializer
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let rate_data = &mut ctx.accounts.rate_data;
        rate_data.authority = *ctx.accounts.authority.key;
        rate_data.oracles = Vec::new();
        msg!("Exchange rate tracker initialized!");
        Ok(())
    }

    // Adds Oracle
    pub fn add_oracle(ctx: Context<ManageOracle>, name: String, oracle_pubkey: Pubkey) -> Result<()> {
        let rate_data = &mut ctx.accounts.rate_data;
        if rate_data.oracles.iter().any(|o| o.pubkey == oracle_pubkey) {
            return err!(ErrorCode::OracleAlreadyExists);
        }
        let new_oracle = Oracle {
            name,
            pubkey: oracle_pubkey,
            rate: 0,
            last_updated: 0,
        };
        rate_data.oracles.push(new_oracle);
        msg!("Oracle {} with pubkey {} added.", rate_data.oracles.last().unwrap().name, oracle_pubkey);
        Ok(())
    }

    // Updates Oracle
    pub fn update_rate(ctx: Context<UpdateRate>, new_rate: u64) -> Result<()> {
        let rate_data = &mut ctx.accounts.rate_data;
        let oracle_signer = &ctx.accounts.oracle;
        let clock = Clock::get()?;
        if let Some(oracle) = rate_data.oracles.iter_mut().find(|o| o.pubkey == *oracle_signer.key) {
            oracle.rate = new_rate;
            oracle.last_updated = clock.unix_timestamp;
            msg!("Rate updated by {}: 1 USD = {} NGN", oracle.name, new_rate);
        } else {
            return err!(ErrorCode::UnauthorizedOracle);
        }
        Ok(())
    }

    // --- DELEGATE INSTRUCTION (MACRO-BASED) ---
    #[delegate]
    pub fn delegate(ctx: Context<DelegateRateData>) -> Result<()> {
        msg!("Delegating rate data account to Ephemeral Rollup...");
        
        // The config => hardcoded validator key
        let config = DelegateConfig {
            commit_frequency_ms: 1000,
            validator: Some(Pubkey::from_str("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd").unwrap()), 
        };
        
        ctx.accounts.del.delegate(config)
    }

    // --- UNDELEGATE INSTRUCTION (MACRO-BASED) ---
    #[undelegate]
    pub fn undelegate(_ctx: Context<UndelegateRateData>) -> Result<()> {
        msg!("Undelegating rate data account from Ephemeral Rollup...");
        Ok(())
    }
}



// ========== ACCOUNTS & STRUCTS ==========

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1024,
        seeds = [b"rate_data"],
        bump
    )]
    pub rate_data: Account<'info, RateData>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ManageOracle<'info> {
    #[account(mut, has_one = authority, seeds = [b"rate_data"], bump)]
    pub rate_data: Account<'info, RateData>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateRate<'info> {
    #[account(mut, seeds = [b"rate_data"], bump)]
    pub rate_data: Account<'info, RateData>,
    pub oracle: Signer<'info>,
}

// --- DELEGATION CONTEXTS ---

#[derive(Accounts, Delegate)]
pub struct DelegateRateData<'info> {
    #[account(mut, has_one = authority, seeds = [b"rate_data"], bump)]
    pub del: Account<'info, RateData>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts, Undelegate)]
pub struct UndelegateRateData<'info> {
    #[account(mut, has_one = authority, seeds = [b"rate_data"], bump)]
    pub del: Account<'info, RateData>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[account]
pub struct RateData {
    pub authority: Pubkey,
    pub oracles: Vec<Oracle>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Oracle {
    pub name: String,
    pub pubkey: Pubkey,
    pub rate: u64,
    pub last_updated: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("The provided oracle is not authorized to update rates.")]
    UnauthorizedOracle,
    #[msg("An oracle with this public key already exists.")]
    OracleAlreadyExists,
}
