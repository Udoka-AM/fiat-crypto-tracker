use anchor_lang::prelude::*;

declare_id!("2Q4J9MoBr6eM8jBBzPcDbSTfG7rKLsm68mYDDLfDZ5kE");

#[program]
pub mod exchange_rate_tracker {
    use super::*;

    // Initializes the main data account that will store the exchange rates.
    // This only needs to be called once when deploying the program.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let rate_data = &mut ctx.accounts.rate_data;
        rate_data.authority = *ctx.accounts.authority.key;
        rate_data.oracles = Vec::new();
        msg!("Exchange rate tracker initialized!");
        Ok(())
    }

    // Adds a new oracle (data source) to the tracker.
    // Only the program's authority can add new oracles.
    // Oracles are identified by a name (e.g., "Parallel Market") and their public key.
    pub fn add_oracle(ctx: Context<ManageOracle>, name: String, oracle_pubkey: Pubkey) -> Result<()> {
        let rate_data = &mut ctx.accounts.rate_data;

        // Check if an oracle with the same public key already exists to prevent duplicates.
        if rate_data.oracles.iter().any(|o| o.pubkey == oracle_pubkey) {
            return err!(ErrorCode::OracleAlreadyExists);
        }

        // Create and add the new oracle to the list.
        let new_oracle = Oracle {
            name,
            pubkey: oracle_pubkey,
            rate: 0, // Initialize rate to 0
            last_updated: 0, // Initialize last updated timestamp to 0
        };
        rate_data.oracles.push(new_oracle);
        msg!("Oracle {} with pubkey {} added.", rate_data.oracles.last().unwrap().name, oracle_pubkey);
        Ok(())
    }

    // Allows a registered oracle to update the exchange rate.
    // The transaction must be signed by the oracle's key.
    pub fn update_rate(ctx: Context<UpdateRate>, new_rate: u64) -> Result<()> {
        let rate_data = &mut ctx.accounts.rate_data;
        let oracle_signer = &ctx.accounts.oracle;
        let clock = Clock::get()?;

        // Find the oracle in the list that matches the signer's public key.
        if let Some(oracle) = rate_data.oracles.iter_mut().find(|o| o.pubkey == *oracle_signer.key) {
            oracle.rate = new_rate;
            oracle.last_updated = clock.unix_timestamp;
            msg!("Rate updated by {}: 1 USD = {} NGN", oracle.name, new_rate);
        } else {
            // If the signer is not a registered oracle, return an error.
            return err!(ErrorCode::UnauthorizedOracle);
        }

        Ok(())
    }
}

// ========== ACCOUNTS & STRUCTS ==========

// Context for the `initialize` instruction.
#[derive(Accounts)]
pub struct Initialize<'info> {
    // The account is now a PDA, initialized with seeds and a bump.
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1024,
        seeds = [b"rate_data"],
        bump
    )]
    pub rate_data: Account<'info, RateData>,
    // The authority who is initializing the program (and will manage oracles).
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// Context for adding or removing oracles.
#[derive(Accounts)]
pub struct ManageOracle<'info> {
    // This now accesses the PDA using the same seeds and bump.
    #[account(mut, has_one = authority, seeds = [b"rate_data"], bump)]
    pub rate_data: Account<'info, RateData>,
    // The authority of the program. The signature is checked by `has_one`.
    pub authority: Signer<'info>,
}

// Context for an oracle updating a rate.
#[derive(Accounts)]
pub struct UpdateRate<'info> {
    // This also accesses the PDA using the same seeds and bump.
    #[account(mut, seeds = [b"rate_data"], bump)]
    pub rate_data: Account<'info, RateData>,
    // The oracle updating the rate. Their signature is required.
    pub oracle: Signer<'info>,
}

// The main account that stores the list of oracles and their data.
#[account]
pub struct RateData {
    pub authority: Pubkey,
    pub oracles: Vec<Oracle>,
}

// Represents a single data source (e.g., a bank, parallel market).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Oracle {
    pub name: String,       // e.g., "Bank A", "Crypto Exchange"
    pub pubkey: Pubkey,     // The public key of the oracle allowed to update this rate
    pub rate: u64,          // The USD/NGN rate (e.g., 1450)
    pub last_updated: i64,  // Unix timestamp of the last update
}


// ========== ERRORS ==========

#[error_code]
pub enum ErrorCode {
    #[msg("The provided oracle is not authorized to update rates.")]
    UnauthorizedOracle,
    #[msg("An oracle with this public key already exists.")]
    OracleAlreadyExists,
}
