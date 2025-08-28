## Fiat-Crypto Tracker ER Demo 🪄

This is fiat-to-crypto exchange rate tracker built on Solana.

### What This Demo Shows
This project demonstrates how ephemeral rollups enhance Solana applications by enabling

- Real-Time Rate Updates: Instantly update fiat-to-crypto exchange rates without waiting for Solana mainnet block confirmations.
- Cost-Effective Operations: Manage thousands of Oracle updates at near-zero cost using ephemeral rollups.
- Seamless Settlement: Automatically commit rate data to the Solana mainnet when needed.

## Details: 
A Solana Anchor program (exchange_rate_tracker) that manages a PDA storing oracle data for exchange rates (e.g., USD to NGN).

### Key Features:
- Initialise a rate data account with an authority and oracle list.
- Add oracles to provide exchange rate updates.
- Update rates in real-time via oracles.
- Delegate and undelegate rate data to ephemeral rollups for high-frequency, low-cost updates.

### Technology: 
Built with Anchor, ephemeral_rollups_sdk, and Solana for scalable, real-time interactions.
### Code: 
Look in the programs/fiat-crypto-tracker/src/lib.rs of the serialisebypass and mbInt branches, featuring instructions for initialisation, oracle management, rate updates, with rollup delegation executed manually and with the SDK macros respectively on each branch.


