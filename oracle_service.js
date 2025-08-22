// oracle-service.js
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ExchangeRateTracker } from "./target/types/exchange_rate_tracker"; // Adjust path to your IDL
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import "dotenv/config"; // To load environment variables from a .env file

// --- CONFIGURATION ---

// This function sets up the connection and loads the Anchor program.
function setupProviderAndProgram() {
    // Make sure your Anchor.toml points to the correct cluster (e.g., localhost or devnet)
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    return anchor.workspace.ExchangeRateTracker as Program<ExchangeRateTracker>;
}

// Helper function to load a Keypair from a base58 encoded private key
function loadKeypairFromSecret(secretKey: string): Keypair {
    try {
        const secret = bs58.decode(secretKey);
        return Keypair.fromSecretKey(secret);
    } catch (e) {
        console.error("Failed to load keypair from secret key. Make sure it's a valid base58 string.", e);
        process.exit(1);
    }
}

// --- MOCK API FETCHERS ---
// In a real application, these would make HTTP requests (e.g., using axios) to actual API endpoints.

// Simulates fetching the rate from a bank's API
async function fetchBankRate(): Promise<number> {
    console.log("Fetching rate from Bank API...");
    // Simulate network delay and rate fluctuation
    await new Promise(resolve => setTimeout(resolve, 500));
    const rate = 1450 + Math.random() * 20; // e.g., rate between 1450 and 1470
    console.log(`  -> Got Bank Rate: ${rate.toFixed(2)}`);
    return Math.floor(rate);
}

// Simulates fetching the rate from a crypto exchange
async function fetchCryptoRate(): Promise<number> {
    console.log("Fetching rate from Crypto Exchange API...");
    await new Promise(resolve => setTimeout(resolve, 500));
    const rate = 1500 + Math.random() * 25; // e.g., rate between 1500 and 1525
    console.log(`  -> Got Crypto Rate: ${rate.toFixed(2)}`);
    return Math.floor(rate);
}

// Simulates fetching the rate from a parallel market source
async function fetchParallelMarketRate(): Promise<number> {
    console.log("Fetching rate from Parallel Market source...");
    await new Promise(resolve => setTimeout(resolve, 500));
    const rate = 1510 + Math.random() * 15; // e.g., rate between 1510 and 1525
    console.log(`  -> Got Parallel Market Rate: ${rate.toFixed(2)}`);
    return Math.floor(rate);
}


// --- ON-CHAIN UPDATE LOGIC ---

/**
 * Sends a transaction to the Solana program to update the rate for a specific oracle.
 * @param program - The initialized Anchor program instance.
 * @param rateDataAccountPubkey - The public key of the main data account.
 * @param oracleKeypair - The keypair of the oracle that is signing the transaction.
 * @param newRate - The new exchange rate to set.
 */

async function updateOnChainRate(
    program: Program<ExchangeRateTracker>,
    rateDataAccountPubkey: PublicKey,
    oracleKeypair: Keypair,
    newRate: number
) {
    try {
        const tx = await program.methods
            .updateRate(new anchor.BN(newRate))
            .accounts({
                rateData: rateDataAccountPubkey,
                oracle: oracleKeypair.publicKey,
            })
            .signers([oracleKeypair]) // The oracle signs to authorize the update
            .rpc();
        
        console.log(`Successfully updated on-chain rate for oracle ${oracleKeypair.publicKey.toBase58()}. Tx: ${tx}`);
    } catch (error) {
        console.error(`Failed to update rate for oracle ${oracleKeypair.publicKey.toBase58()}:`, error.logs || error.message);
    }
}


// --- MAIN EXECUTION ---

async function main() {
    console.log("Starting Oracle Service...");

    // 1. Load configuration from environment variables
    if (!process.env.RATE_DATA_ACCOUNT_PUBKEY || !process.env.ORACLE_1_SECRET_KEY || !process.env.ORACLE_2_SECRET_KEY) {
        console.error("Please set RATE_DATA_ACCOUNT_PUBKEY, ORACLE_1_SECRET_KEY, and ORACLE_2_SECRET_KEY in your .env file.");
        return;
    }
    
    const rateDataAccountPubkey = new PublicKey(process.env.RATE_DATA_ACCOUNT_PUBKEY);
    const oracle1Keypair = loadKeypairFromSecret(process.env.ORACLE_1_SECRET_KEY);
    const oracle2Keypair = loadKeypairFromSecret(process.env.ORACLE_2_SECRET_KEY);
    // You can add more oracles here
    
    // 2. Initialize connection to the program
    const program = setupProviderAndProgram();

    console.log(`Oracle service configured for data account: ${rateDataAccountPubkey.toBase58()}`);
    console.log(`Oracle 1 Pubkey: ${oracle1Keypair.publicKey.toBase58()}`);
    console.log(`Oracle 2 Pubkey: ${oracle2Keypair.publicKey.toBase58()}`);

    // 3. Run the oracle loop every 15 seconds
    const UPDATE_INTERVAL_MS = 15000;
    setInterval(async () => {
        console.log("\n--- Running update cycle ---");
        
        // Fetch rates from all sources concurrently
        const [bankRate, cryptoRate] = await Promise.all([
            fetchBankRate(),
            fetchCryptoRate()
        ]);

        // Update the on-chain data for each oracle
        await updateOnChainRate(program, rateDataAccountPubkey, oracle1Keypair, bankRate);
        await updateOnChainRate(program, rateDataAccountPubkey, oracle2Keypair, cryptoRate);

        console.log("--- Update cycle finished ---\n");

    }, UPDATE_INTERVAL_MS);
}

main().catch(err => {
    console.error("Oracle service crashed with an error:", err);
});
