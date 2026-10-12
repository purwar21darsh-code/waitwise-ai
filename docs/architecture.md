# Architecture

## Application boundary

```text
React + Vite browser app
  ├─ deterministic finance library (decision, score, EMI, scenarios)
  ├─ local browser storage (profile, plans, manual price entries)
  ├─ optional /api/explain request
  └─ EIP-1193 wallet → ethers → WaitwiseVault on Monad Testnet

Node HTTP API
  └─ Zod request validation → configured OpenAI-compatible provider

Hardhat
  ├─ WaitwiseVault.sol
  └─ local EVM contract tests
```

The decision engine is the authority for the recommendation. The API receives a restricted projection of its result and can explain it in plain language. The browser falls back to the deterministic reason if the API is not configured, rejects the request, or times out.

## Financial model

The decision engine computes near-term obligations from upcoming expenses plus essential monthly expenses and debt prorated to the next expected income date (bounded at 30 days). It compares cash after the purchase and obligations with the user-entered reserve target. It also computes monthly surplus after planned savings. An uncovered shortfall or monthly deficit blocks a buy-now recommendation; missing profile values lead to a cautious wait recommendation.

The safety score has four independent capped components: reserve adequacy (30), monthly budget (25), purchase affordability (25), and savings-goal progress (20). Missing data is surfaced beside the score. The formulas and interpretation are available in the app's Help screen.

EMI uses the standard amortizing monthly-payment formula. Zero rate uses principal divided by months. Fees are listed separately from interest and added to the total financing cost.

The simulator uses entered monthly net cashflow for a wait scenario, counts upcoming expenses once, and assumes the entered purchase price stays unchanged. Savings contributions affect shown goal progress. No future price, investment return, or salary increase is inferred.

## Data and privacy

Profile, offchain savings plans, and manual price observations are stored in `localStorage`; this is convenient demo storage, not secure or authoritative financial storage. There is no authentication or bank connection. A manual product URL is only saved as a reference; the application does not fetch or scrape it.

The optional AI endpoint accepts a product name, question, and validated calculation fields. It never receives a wallet signing key. No user data is logged by the endpoint code. The configured provider's own data practices still apply.

Only a contract read establishes vault balances and goal state. Browser state never changes the value shown as an onchain deposit. The contract stores a hash of a goal label, not the label itself.

## Monad network

The app and Hardhat configuration target Monad Testnet, chain ID 10143. The public RPC responded with `0x279f` during implementation. Official network details, public RPCs, explorers, testnet reset notice, and faucet link are documented by [Monad](https://docs.monad.xyz/developer-essentials/testnet). The testnet explorer and faucet are linked from the official network page.

## Limits

- One browser origin and one browser profile; local storage has no sync or account recovery.
- No price feed, product catalog, notifications service, lender API, bank API, backend database, analytics, or authentication.
- Native MON only; no ERC-20 handling, yield, relayer, gas sponsorship, or smart-account flow.
- Contract deployment is intentionally a separate environment-dependent step.
