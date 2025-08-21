import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ExchangeRateTracker } from "../target/types/exchange_rate_tracker";
import { assert } from "chai";

describe("exchange-rate-tracker", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ExchangeRateTracker as Program<ExchangeRateTracker>;
  const authority = provider.wallet.publicKey;

  // Keypair for the main data account
  const rateDataAccount = anchor.web3.Keypair.generate();

  // Keypairs for two different oracles
  const oracle1 = anchor.web3.Keypair.generate();
  const oracle2 = anchor.web3.Keypair.generate();

  // Keypair for an unauthorized account
  const unauthorizedUser = anchor.web3.Keypair.generate();

  it("Is initialized!", async () => {
    // Airdrop some SOL to the new accounts to pay for transactions
    await provider.connection.requestAirdrop(oracle1.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(oracle2.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(unauthorizedUser.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);

    // Initialize the main rate data account
    const tx = await program.methods
      .initialize()
      .accounts({
        rateData: rateDataAccount.publicKey,
        authority: authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([rateDataAccount])
      .rpc();

    console.log("Your transaction signature", tx);

    // Fetch the created account
    const account = await program.account.rateData.fetch(rateDataAccount.publicKey);
    
    // Assert that the authority is set correctly and the oracles list is empty
    assert.ok(account.authority.equals(authority));
    assert.isEmpty(account.oracles);
  });

  it("Adds a new oracle", async () => {
    const oracleName = "Parallel Market";
    await program.methods
      .addOracle(oracleName, oracle1.publicKey)
      .accounts({
        rateData: rateDataAccount.publicKey,
        authority: authority,
      })
      .rpc();

    // Fetch the account again to check the new oracle
    const account = await program.account.rateData.fetch(rateDataAccount.publicKey);
    
    // Assert that there is now one oracle in the list
    assert.lengthOf(account.oracles, 1);
    // Assert that the details of the added oracle are correct
    assert.equal(account.oracles[0].name, oracleName);
    assert.ok(account.oracles[0].pubkey.equals(oracle1.publicKey));
    assert.equal(account.oracles[0].rate.toNumber(), 0);
  });

  it("Fails to add a duplicate oracle", async () => {
    try {
      // Attempt to add the same oracle again
      await program.methods
        .addOracle("Duplicate Oracle", oracle1.publicKey)
        .accounts({
          rateData: rateDataAccount.publicKey,
          authority: authority,
        })
        .rpc();
      // If the above doesn't throw, the test should fail
      assert.fail("Should have failed to add a duplicate oracle.");
    } catch (err) {
      // Check that the error is the expected `OracleAlreadyExists` error
      assert.equal(err.error.errorCode.code, "OracleAlreadyExists");
      assert.equal(err.error.errorMessage, "An oracle with this public key already exists.");
    }
  });

  it("Allows an authorized oracle to update the rate", async () => {
    const newRate = new anchor.BN(1450);
    await program.methods
      .updateRate(newRate)
      .accounts({
        rateData: rateDataAccount.publicKey,
        oracle: oracle1.publicKey,
      })
      .signers([oracle1]) // The oracle must sign the transaction
      .rpc();

    const account = await program.account.rateData.fetch(rateDataAccount.publicKey);
    
    // Find the oracle that was just updated
    const updatedOracle = account.oracles.find(o => o.pubkey.equals(oracle1.publicKey));

    // Assert that the rate and timestamp were updated
    assert.isDefined(updatedOracle);
    assert.equal(updatedOracle.rate.toNumber(), newRate.toNumber());
    assert.isAbove(updatedOracle.lastUpdated.toNumber(), 0); // Check that timestamp is not 0
  });

  it("Prevents an unauthorized user from updating the rate", async () => {
    try {
      const newRate = new anchor.BN(1500);
      // Attempt to update the rate with an unauthorized signer
      await program.methods
        .updateRate(newRate)
        .accounts({
          rateData: rateDataAccount.publicKey,
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
