use anchor_lang::prelude::*;

use ephemeral_rollups_sdk::{
    cpi::{
        accounts::{DelegateAccounts, UndelegateAccounts},
        delegate_account, undelegate_account, DelegateConfig,
    },
    program::Delegation,
};
declare_id!("2Q4J9MoBr6eM8jBBzPcDbSTfG7rKLsm68mYDDLfDZ5kE");

#[program]
pub mod exchange_rate_tracker {
    use super::*;

    // PDA Init
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let rate_data = &mut ctx.accounts.rate_data;
        rate_data.authority = *ctx.accounts.authority.key;
        rate_data.oracles = Vec::new();
        msg!("Exchange rate tracker initialized!");
        Ok(())
    }

    // Add Oracle
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

    // Update Oracle
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

    // --- DELEGATE INSTRUCTION (MANUAL CPI) ---
    pub fn delegate(ctx: Context<DelegateRateData>) -> Result<()> {
        msg!("Delegating rate data account to Ephemeral Rollup...");
        
        let cpi_program = ctx.accounts.delegation_program.to_account_info();
        let cpi_accounts = DelegateAccounts {
            pda: ctx.accounts.rate_data.to_account_info(),
            owner_program: ctx.accounts.owner_program.to_account_info(),
            payer: ctx.accounts.authority.to_account_info(),
            buffer: ctx.accounts.buffer.to_account_info(),
            delegation_record: ctx.accounts.delegation_record.to_account_info(),
            delegation_metadata: ctx.accounts.delegation_metadata.to_account_info(),
            delegation_program: ctx.accounts.delegation_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };

        let bump = ctx.bumps.rate_data;
        let seeds = &[&b"rate_data"[..], &[bump]];
        
        // delegate config here
        let config = DelegateConfig {
            commit_frequency_ms: 1000, 
            validator: Some(*ctx.accounts.authority.key), 
        };

       
        delegate_account(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, &[&seeds[..]]),
            config,
            &[&seeds[..]],
        )?;

        Ok(())
    }


    // --- UNDELEGATE INSTRUCTION (MANUAL CPI) ---
    pub fn undelegate(ctx: Context<UndelegateRateData>) -> Result<()> {
        msg!("Undelegating rate data account from Ephemeral Rollup...");

        let cpi_program = ctx.accounts.delegation_program.to_account_info();
        let cpi_accounts = UndelegateAccounts {
            pda: ctx.accounts.rate_data.to_account_info(),
            owner_program: ctx.accounts.owner_program.to_account_info(),
            payer: ctx.accounts.authority.to_account_info(),
            delegation_record: ctx.accounts.delegation_record.to_account_info(),
            delegation_program: ctx.accounts.delegation_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };

        let bump = ctx.bumps.rate_data;
        let seeds = &[&b"rate_data"[..], &[bump]];

        undelegate_account(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, &[&seeds[..]]),
        )?;
        
        Ok(())
    }
}


// --- ACCOUNTS & STRUCTS ---

// Initialize now creates a PDA
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

// --- CONTEXTS FOR MANUAL DELEGATION CPI ---

#[derive(Accounts)]
pub struct DelegateRateData<'info> {
    #[account(mut, has_one = authority, seeds = [b"rate_data"], bump)]
    pub rate_data: Account<'info, RateData>,
    #[account(mut)]
    pub authority: Signer<'info>,

    pub owner_program: AccountInfo<'info>,
    pub delegation_program: Program<'info, Delegation>,
    pub system_program: Program<'info, System>,
   
    #[account(mut)]
    pub buffer: AccountInfo<'info>,
  
    pub delegation_record: AccountInfo<'info>,
   
    #[account(mut)]
    pub delegation_metadata: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UndelegateRateData<'info> {
    #[account(mut, has_one = authority, seeds = [b"rate_data"], bump)]
    pub rate_data: Account<'info, RateData>,
    #[account(mut)]
    pub authority: Signer<'info>,
   
    pub owner_program: AccountInfo<'info>,
    pub delegation_program: Program<'info, Delegation>,
    pub system_program: Program<'info, System>,
   
    #[account(mut)]
    pub delegation_record: AccountInfo<'info>,
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