# Setup and deployment

## Local web app

```powershell
pnpm install
Copy-Item .env.example .env
pnpm dev
```

The browser app is at `http://localhost:5173`; the optional Node explanation API listens on `http://localhost:8787`. Set `AI_API_KEY` only in `.env` on the server side. With no key, explain requests return a controlled unavailable response and the UI shows a deterministic explanation. `AI_BASE_URL` and `AI_MODEL` can point to an OpenAI-compatible endpoint; confirm compatibility before use.

## Monad Testnet settings

| Setting | Value |
|---|---|
| Network | Monad Testnet |
| Chain ID | 10143 (`0x279f`) |
| Native token | MON |
| RPC | `https://testnet-rpc.monad.xyz` |
| Explorer | `https://testnet.monadvision.com` |
| Faucet | `https://faucet.monad.xyz` |

These values are checked against the [official Monad Testnet documentation](https://docs.monad.xyz/developer-essentials/testnet); the RPC returned chain ID `0x279f` at implementation time. The official faucet says test tokens have no real value. Recheck current docs before a demo because the testnet can reset and public RPC limits apply.

## Compile, test, and deploy the contract

1. Create a new wallet only for the testnet demo. Never send the seed phrase to the application.
2. Obtain testnet MON through the [official faucet](https://faucet.monad.xyz/).
3. Add a local `.env` (already ignored by Git) and set `DEPLOYER_PRIVATE_KEY` and optionally `MONAD_RPC_URL`. Never commit this file or print its contents.
4. Run:

   ```powershell
   pnpm compile:contracts
   pnpm test:contracts
   pnpm deploy:testnet
   ```

5. Record the deployment address and transaction from the actual CLI output. Verify both on the [MonadVision Testnet explorer](https://testnet.monadvision.com/).
6. Set `VITE_VAULT_ADDRESS=0x...` in `.env` and restart Vite. The address is public client configuration, not a secret.
7. Connect a wallet, check that its network is chain ID 10143, create a small goal, deposit faucet MON, wait for a successful receipt, cancel or complete the goal, and withdraw. Verify each state and transaction on the explorer.

The deployment script refuses to run without the deployer key, and the wallet UI disables contract actions if no address is configured. The frontend does not invent an address or report a transaction as confirmed before a successful receipt and contract reread.

## Frontend hosting

Build with `pnpm build` and deploy the generated `dist/` folder to a static host of your choice. Configure all required `VITE_` values in that host's build environment, including the real testnet contract address. Do not add `AI_API_KEY`, `DEPLOYER_PRIVATE_KEY`, or `MONAD_RPC_URL` as browser variables. The Node explanation endpoint needs a server deployment and a same-origin `/api` route or a configured proxy; if no API server is deployed, omit the AI key and retain the deterministic fallback.

No hosting provider credentials, GitHub remote, deployer key, or contract address were present in this workspace. A hosted app, public repository, and Monad deployment therefore remain pending and must be verified after the external steps above.
