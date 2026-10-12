# Technical demo script (target: 2:45, maximum: 3:00)

**Before recording:** use a fresh demo wallet funded only from the official Monad Testnet faucet; deploy and verify the actual `WaitwiseVault` address; set `VITE_VAULT_ADDRESS`; test the explorer links; use a small testnet amount; close personal tabs and hide secrets. If any external step is not ready, describe it as pending and do not imply a transaction occurred.

| Time | Screen / action | Narration |
|---|---|---|
| 0:00–0:15 | WAITWISE dashboard | “WAITWISE helps students see how a large purchase fits around bills, a cash buffer, and a savings goal. The sample profile is clearly labeled.” |
| 0:15–0:40 | Enter a laptop, price, urgency, then run analysis | “This result comes from deterministic rules. Here are the near-term obligations, remaining cash, reserve target, assumptions, and risk factors. The optional explanation only describes those calculated values.” |
| 0:40–1:00 | What-if planner: compare today, 7 days, 30 days, and a cheaper option | “We hold the current price constant because future prices are unknown. I can adjust savings, income assumptions, and upcoming costs and see the comparison update.” |
| 1:00–1:15 | Add a savings goal | “This is a local plan in rupees; it does not move money. Progress and the estimated date depend on the contribution entered.” |
| 1:15–1:35 | Open vault disclosures, connect demo wallet, check Monad Testnet | “The vault is optional. This screen explains the test token, network, fees, cancellation, and recovery before I ask the wallet to sign. These MON test tokens have no real value.” |
| 1:35–2:00 | Create a small testnet goal; show actual wallet prompt; submit a small deposit | “The wallet is the only signer. I confirm the amount and wait for an actual receipt. WAITWISE does not mark this complete when I click.” |
| 2:00–2:20 | Show confirmed transaction and reread contract balance; open explorer transaction link | “Now the app has a successful receipt and has reread the onchain balance. Here is the real transaction record.” |
| 2:20–2:45 | Explain cancel / completion / deadline rules; cancel and withdraw only if time and gas permit | “The owner can cancel an active goal. Funds are withdrawable after cancellation, target completion, or the optional deadline. There is no administrator key and no yield.” |

Do not show a fabricated address, hash, balance, deployment, or user-test result. If wallet confirmation or the RPC fails, show the error as the result and state what remains unverified.
