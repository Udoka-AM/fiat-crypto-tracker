import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ExchangeRateTracker } from "../target/types/exchange_rate_tracker";
import { assert } from "chai";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

describe("exchange-rate-tracker", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ExchangeRateTracker as Program<ExchangeRateTracker>;
  const authority = provider.wallet.publicKey;

  // --- PDA CALCULATION ---
  // Find the PDA for the rate_data account. This is now a deterministic address.
  const [rateDataPDA, _] = PublicKey.findProgramAddressSync(
    [Buffer.from("rate_data")],
    program.programId
  );

  console.log("Your Rate Data PDA is:", rateDataPDA.toBase58());

  // Keypairs for your two specific oracles
  const exchangeRateApiKeypair = anchor.web3.Keypair.generate();
  const binanceApiKeypair = anchor.web3.Keypair.generate();
  
  // You will need these secret keys for your .env file
  console.log("ExchangeRate-API Oracle SECRET Key:", bs58.encode(exchangeRateApiKeypair.secretKey));
  console.log("Binance Oracle SECRET Key:", bs58.encode(binanceApiKeypair.secretKey));
  
  console.log("ExchangeRate-API Oracle Pubkey:", exchangeRateApiKeypair.publicKey.toBase58());
  console.log("Binance Oracle Pubkey:", binanceApiKeypair.publicKey.toBase58());

  // Keypair for an unauthorized account
  const unauthorizedUser = anchor.web3.Keypair.generate();

  it("Is initialized!", async () => {
    // Airdrop some SOL to the new accounts to pay for transactions
    await provider.connection.requestAirdrop(exchangeRateApiKeypair.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(binanceApiKeypair.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(unauthorizedUser.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);

    // Initialize the main rate data account using its PDA
    const tx = await program.methods
      .initialize()
      .accounts({
        rateData: rateDataPDA, // Use the PDA address
        authority: authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      // The PDA account keypair is no longer needed as a signer
      .rpc();

    console.log("Your transaction signature", tx);

    // Fetch the created account
    const account = await program.account.rateData.fetch(rateDataPDA);
    
    // Assert that the authority is set correctly and the oracles list is empty
    assert.ok(account.authority.equals(authority));
    assert.isEmpty(account.oracles);
  });

  it("Adds the ExchangeRate-API and Binance oracles", async () => {
    // Add the first oracle
    await program.methods
      .addOracle("ExchangeRate-API", exchangeRateApiKeypair.publicKey)
      .accounts({
        rateData: rateDataPDA,
        authority: authority,
      })
      .rpc();

    // Add the second oracle
    await program.methods
      .addOracle("Binance", binanceApiKeypair.publicKey)
      .accounts({
        rateData: rateDataPDA,
        authority: authority,
      })
      .rpc();

    // Fetch the account again to check the new oracles
    const account = await program.account.rateData.fetch(rateDataPDA);
    
    // Assert that there are now two oracles in the list
    assert.lengthOf(account.oracles, 2);
    
    // Verify the details of the first oracle
    const firstOracle = account.oracles.find(o => o.name === "ExchangeRate-API");
    assert.isDefined(firstOracle);
    assert.ok(firstOracle.pubkey.equals(exchangeRateApiKeypair.publicKey));

    // Verify the details of the second oracle
    const secondOracle = account.oracles.find(o => o.name === "Binance");
    assert.isDefined(secondOracle);
    assert.ok(secondOracle.pubkey.equals(binanceApiKeypair.publicKey));
  });


  it("Allows the ExchangeRate-API oracle to update the rate", async () => {
    const newRate = new anchor.BN(1450);
    await program.methods
      .updateRate(newRate)
      .accounts({
        rateData: rateDataPDA,
        oracle: exchangeRateApiKeypair.publicKey,
      })
      .signers([exchangeRateApiKeypair]) // The oracle must sign the transaction
      .rpc();

    const account = await program.account.rateData.fetch(rateDataPDA);
    const updatedOracle = account.oracles.find(o => o.pubkey.equals(exchangeRateApiKeypair.publicKey));

    assert.isDefined(updatedOracle);
    assert.equal(updatedOracle.rate.toNumber(), newRate.toNumber());
  });

  it("Allows the Binance oracle to update the rate", async () => {
    const newRate = new anchor.BN(1510);
    await program.methods
      .updateRate(newRate)
      .accounts({
        rateData: rateDataPDA,
        oracle: binanceApiKeypair.publicKey,
      })
      .signers([binanceApiKeypair]) // The oracle must sign the transaction
      .rpc();

    const account = await program.account.rateData.fetch(rateDataPDA);
    const updatedOracle = account.oracles.find(o => o.pubkey.equals(binanceApiKeypair.publicKey));

    assert.isDefined(updatedOracle);
    assert.equal(updatedOracle.rate.toNumber(), newRate.toNumber());
  });


  it("Prevents an unauthorized user from updating the rate", async () => {
    try {
      const newRate = new anchor.BN(1500);
      // Attempt to update the rate with an unauthorized signer
      await program.methods
        .updateRate(newRate)
        .accounts({
          rateData: rateDataPDA,
          oracle: unauthorizedUser.publicKey,
        })
        .signers([unauthorizedUser])
        .rpc();
      assert.fail("Should have failed for unauthorized oracle.");
    } catch (err) {
      // Check for the correct error
      assert.equal(err.error.errorCode.code, "UnauthorizedOracle");
      assert.equal(err.error.errorMessage, "The provided oracle is not authorized to update rates.");
    }
  });
});
