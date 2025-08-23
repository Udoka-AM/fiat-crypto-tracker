// oracle-service.js
import anchor from "@coral-xyz/anchor";
const { BN } = anchor; 
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import "dotenv/config"; 

// --- CONFIGURATION ---


function setupProviderAndProgram() {
    // Make sure your Anchor.toml points to the correct cluster (e.g., localhost or devnet)
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    // Removed the TypeScript "as Program<...>" syntax
    return anchor.workspace.ExchangeRateTracker;
}

// Helper function to load a Keypair from a base58 encoded private key
function loadKeypairFromSecret(secretKey) { // Removed TypeScript type annotation
    try {
        const secret = bs58.decode(secretKey);
        return Keypair.fromSecretKey(secret);
    } catch (e) {
        console.error("Failed to load keypair from secret key. Make sure it's a valid base58 string.", e);
        process.exit(1);
    }
}

// --- API FETCHERS ---

// Fetches the rate from the ExchangeRate-API
async function fetchBankRate() {
    try {
        console.log("Fetching rate from ExchangeRate-API...");
        const apiKey = process.env.EXCHANGERATE_API_KEY;

        if (!apiKey) {
            console.error("ExchangeRate-API key not found in .env file.");
            return 0; // Return a default value or handle the error
        }

        // Use the API endpoint with NGN as the base currency
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/NGN`);
        const data = await response.json();

        // The API returns the value of 1 NGN in USD. We need the inverse.
        const usdValue = data.conversion_rates.USD;
        const ngnRate = 1 / usdValue;
        
        console.log(`  -> Got ExchangeRate-API Rate: ${ngnRate}`);
        return Math.floor(ngnRate);
    } catch (error) {
        console.error("Error fetching from ExchangeRate-API:", error);
        return 0; // Return a default value on error
    }
}

// Fetches the real-time rate from the Binance API
async function fetchCryptoRate() {
    try {
        console.log("Fetching rate from Binance API...");
        const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=USDTNGN');
        const data = await response.json();
        const ngnRate = parseFloat(data.price);
        
        console.log(`  -> Got Binance Rate: ${ngnRate}`);
        return Math.floor(ngnRate);
    } catch (error) {
        console.error("Error fetching from Binance API:", error);
        return 0; // Return a default value on error
    }
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
    program, // Removed TypeScript type annotations
    rateDataAccountPubkey,
    oracleKeypair,
    newRate
) {
    // Do not send an update if the rate is 0 (which indicates an API error)
    if (newRate === 0) {
        console.log(`Skipping update for oracle ${oracleKeypair.publicKey.toBase58()} due to invalid rate.`);
        return;
    }

    try {
        const tx = await program.methods
           .updateRate(new BN(newRate))
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
    if (!process.env.RATE_DATA_ACCOUNT_PUBKEY || !process.env.EXCHANGERATE_ORACLE_SECRET_KEY || !process.env.BINANCE_ORACLE_SECRET_KEY) {
        console.error("Please set RATE_DATA_ACCOUNT_PUBKEY, EXCHANGERATE_ORACLE_SECRET_KEY, and BINANCE_ORACLE_SECRET_KEY in your .env file.");
        return;
    }
    
    const rateDataAccountPubkey = new PublicKey(process.env.RATE_DATA_ACCOUNT_PUBKEY);
    const exchangeRateApiKeypair = loadKeypairFromSecret(process.env.EXCHANGERATE_ORACLE_SECRET_KEY);
    const binanceApiKeypair = loadKeypairFromSecret(process.env.BINANCE_ORACLE_SECRET_KEY);
    
    // 2. Initialize connection to the program
    const program = setupProviderAndProgram();

    console.log(`Oracle service configured for data account: ${rateDataAccountPubkey.toBase58()}`);
    console.log(`ExchangeRate-API Oracle Pubkey: ${exchangeRateApiKeypair.publicKey.toBase58()}`);
    console.log(`Binance Oracle Pubkey: ${binanceApiKeypair.publicKey.toBase58()}`);

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
        await updateOnChainRate(program, rateDataAccountPubkey, exchangeRateApiKeypair, bankRate);
        await updateOnChainRate(program, rateDataAccountPubkey, binanceApiKeypair, cryptoRate);

        console.log("--- Update cycle finished ---\n");

    }, UPDATE_INTERVAL_MS);
}

main().catch(err => {
    console.error("Oracle service crashed with an error:", err);
});
