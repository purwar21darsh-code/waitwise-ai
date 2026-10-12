# WAITWISE AI

**Buy Smarter. Stress Less.**

WAITWISE helps Indian students and early-career professionals decide whether to buy a costly item now, wait, or choose a lower-cost option. It combines deterministic, explainable money calculations with an optional AI explanation and a non-yielding, owner-controlled native MON savings vault on Monad Testnet.

> This is an educational prototype, not financial, credit, lending, or investment advice. It does not promise savings, price reductions, or returns. The initial profile is labeled example data. Do not deposit real funds.

## Current status

| Feature | Status |
|---|---|
| Buy / wait decision engine | Implemented with deterministic rules and uncertainty warnings |
| Financial safety score | Implemented; 4 explicit components, 100 point maximum |
| What-if simulator | Implemented for today, 7 days, 30 days, chosen date, cheaper item, and entered EMI offer |
| EMI checker | Implemented for zero or positive rates and disclosed fees; no lender rates are supplied |
| Price history | Replaceable async provider interface with a manual local adapter, chart, range after 2 entries, and local target alert; no live provider configured |
| Purchase-risk analysis | Implemented from cash shortfall, reserve, and monthly budget |
| Savings goals | Multiple local plans with progress and completion estimates; no funds move |
| Monad Testnet vault | Solidity contract and wallet integration implemented; contract address and deployment remain pending |
| AI explanation | Optional server-side OpenAI-compatible provider; deterministic fallback when unavailable |
| Public demo | [Open WAITWISE AI](https://purwar21darsh-code.github.io/waitwise-ai/) — hosted on GitHub Pages; the hosted version uses deterministic explanations and has no deployed vault address |

## Requirements

- Node.js 20 or newer
- pnpm 9 or newer
- A modern browser; MetaMask or another EIP-1193 wallet is needed only for vault transactions
- Testnet MON from the [official Monad faucet](https://faucet.monad.xyz/) for testnet transactions

## Run locally

```powershell
pnpm install
Copy-Item .env.example .env
pnpm dev
```

Open the **Local** URL printed by Vite (normally `http://127.0.0.1:5173`; Vite selects the next free port when 5173 is occupied). Vite serves the React app and proxies `/api` to the optional explanation API on port 8787. With no AI key, the deterministic explanation remains available. You can also run only the frontend with `pnpm dev:web`.

The preloaded financial profile is marked **Example profile**. Edit it under **Profile & privacy**. The profile, savings plans, and manual price observations are saved in browser local storage. They are not encrypted, backed up, verified against a bank, or authoritative. Use **Clear local profile and plans** to remove them from this browser.

## Environment variables

See [`.env.example`](./.env.example). Browser variables use the `VITE_` prefix and are public in the compiled app. Never put secrets or private keys in a `VITE_` variable. The AI API key and deployer key are server/CLI-only.

The verified Monad Testnet settings are chain ID **10143** (`0x279f`), native currency **MON**, public RPC `https://testnet-rpc.monad.xyz`, faucet `https://faucet.monad.xyz`, and the MonadVision testnet explorer `https://testnet.monadvision.com`. The RPC returned `0x279f` during implementation. Check the [current official testnet network page](https://docs.monad.xyz/developer-essentials/testnet) before a demo because public endpoints and testnets can change. The official faucet labels its tokens as development-only with no real value.

## Checks

```powershell
pnpm typecheck
pnpm test
pnpm compile:contracts
pnpm test:contracts
pnpm build
```

The calculation and UI tests use Vitest and React Testing Library. The contract tests use Hardhat's local EVM; they do not submit Monad transactions. Only an actual wallet transaction against a deployed address can confirm the testnet path.

## Deploy the vault to Monad Testnet

Read [`docs/deployment.md`](./docs/deployment.md) and [`docs/security.md`](./docs/security.md) first. In summary:

1. Create a fresh demo-only wallet. Never use a personal wallet or paste a seed phrase into WAITWISE.
2. Copy its private key only into a local, untracked `.env` as `DEPLOYER_PRIVATE_KEY`; use a separate `MONAD_RPC_URL` if desired.
3. Get testnet MON from the official faucet and confirm the wallet is on chain ID 10143.
4. Run `pnpm compile:contracts`, `pnpm test:contracts`, then `pnpm deploy:testnet`.
5. Check the returned deployment transaction and source on the [MonadVision testnet explorer](https://testnet.monadvision.com/).
6. Set `VITE_VAULT_ADDRESS` to the real deployment address in `.env`, restart `pnpm dev`, connect a wallet, and read the contract state.
7. Verify an actual goal-creation, deposit, cancellation/goal-completion, and withdrawal transaction before describing the flow as tested on testnet.

No contract address, testnet transaction, live URL, audit, or user-test result is claimed in this repository. No deployment private key or contract address was available in the workspace during this build.

## Repository map

```text
api/
  schema.ts                 Structured AI request validation and prompt boundary
  server.ts                 Optional server-side explanation endpoint
  schema.test.ts
contracts/
  WaitwiseVault.sol         Native MON goal vault
  scripts/deploy.ts
  test/                     Hardhat tests and reentrancy test helper
src/
  App.tsx                   Responsive application and user flows
  styles.css                Fintech design system and breakpoints
  lib/finance.ts            Deterministic decision, score, EMI, and scenario logic
  lib/models.ts             Local goal projection and data shapes
  lib/price-provider.ts     Async provider boundary and manual price-history adapter
  *.test.tsx / *.test.ts    Frontend and calculation tests
docs/
  architecture.md
  deployment.md
  security.md
  user-testing.md
  distribution.md
  demo-script.md
  pitch-script.md
  logo.md
public/logo/
  waitwise-mark.svg
  waitwise-mark.png
.env.example
hardhat.config.ts
```

## Product constraints

- Future product prices and income are never forecast. The simulator uses explicit user-entered assumptions.
- Price observations are manual. WAITWISE does not scrape shops or claim a provider integration.
- Rupee savings goals are local plans. They are not contract deposits.
- The vault is testnet-only native MON, without yield, admin withdrawal powers, ERC-20 support, or gas sponsorship.
- A contract deposit is shown as confirmed only after the wallet returns a receipt with success and the app rereads the contract.
- The AI service explains supplied calculation results; it does not decide the recommendation or execute transactions.

## Hackathon materials

- Technical demo: [`docs/demo-script.md`](./docs/demo-script.md) (under 3 minutes; requires a deployed testnet contract and funded test wallet)
- Pitch: [`docs/pitch-script.md`](./docs/pitch-script.md) (about 2 minutes; contains no fabricated traction)
- User testing and result template: [`docs/user-testing.md`](./docs/user-testing.md)
- First 100 users experiment: [`docs/distribution.md`](./docs/distribution.md)
- Logo PNG and regeneration specification: [`docs/logo.md`](./docs/logo.md)

The repository is public and the static demo is live at [waitwise-ai](https://purwar21darsh-code.github.io/waitwise-ai/). For a hackathon submission, share the demo and repository links; add a reviewer as a collaborator only if the submission process requires it. The hosted static demo does not include the optional API service or a deployed Monad Testnet vault, so explanations use the deterministic fallback and vault transactions are unavailable there.
