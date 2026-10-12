# Security notes

## Contract design

`WaitwiseVault` supports native MON only. Each goal has an owner, target amount, optional deadline, deposited balance, reference hash, and status. The only state-changing functions are owner-gated goal creation, deposit, cancellation, and withdrawal. There is no contract administrator or privileged recovery path.

The owner can recover funds after canceling an active goal, reaching its target, or after its optional deadline. A deadline is considered reached when `block.timestamp >= deadline`; new deposits are rejected at that boundary. A goal without a deadline can be canceled or completed at any time. Withdrawal is owner-only, validates a positive amount no greater than the goal balance, updates state before the external value transfer, and uses a reentrancy guard. A failed transfer reverts the whole operation.

Contract tests cover creation, invalid values, successful and repeated deposits, target completion, unauthorized actions, invalid withdrawals, cancellation, partial recovery, deadline boundary behavior, emitted events, and a receiver attempting reentrancy.

## Browser and AI boundaries

- The app never requests a seed phrase or private key. Wallet signatures and transaction prompts are handled by the injected wallet.
- Deployer secrets belong in an untracked `.env`, never in a `VITE_` variable or source control.
- AI API keys stay on the Node server. The endpoint validates inputs, caps request size, applies a timeout, and returns only a short text explanation.
- Product names and free-text questions are treated as untrusted data in the system prompt. The calculation engine remains authoritative; AI output cannot modify a score, result, contract state, or transaction.
- Browser storage is not encrypted. Avoid entering sensitive personal data on a shared device.
- The goal label is hashed before writing the reference onchain; hashes are public and low-entropy labels may be guessable. Do not include private information in a goal label.

## Known limits and review status

This is a hackathon prototype and has not received a professional security audit or formal verification. The contract is small and has no upgradeability or yield logic, but this is not a guarantee of safety. Testnet tokens are for development and have no real-world value. Do not deploy to Mainnet or deposit real value based on this prototype.

Before a public testnet demo, use a fresh test wallet, review the compiled bytecode and source, verify the deployed contract address, check the explorer links, and exercise create/deposit/cancel/withdraw using only faucet funds. Before any real-value use, obtain independent security review and a legal/product review.
