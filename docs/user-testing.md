# Five-user validation plan

## Status

Planned only. No user interviews or task tests have been run, and no results are claimed.

## Participants and privacy

Recruit five college students in India who recently considered a laptop, phone, tablet, or study-equipment purchase. Ask for consent to observe a short prototype session. Do not collect account credentials, exact bank balances, phone numbers, or other sensitive financial data. Use a supplied fictional profile and purchase scenario; participants may skip any question. Record anonymous participant codes only.

## 20-minute session script

1. Explain: “We are testing whether the product and its language make sense. We are not evaluating your financial decisions. Please use the sample numbers; do not share private account information.”
2. Ask the participant to describe how they would currently decide to buy an expensive study item.
3. Give a fictional profile and ask them to enter a product and run a purchase analysis.
4. Ask them to explain the recommendation in their own words and identify which number most influenced it.
5. Ask them to compare buying today, waiting, and choosing the lower-price alternative in the simulator.
6. Ask them to create an offchain savings plan and identify whether money has moved.
7. Show the vault screen. Ask them to explain the network, token, fees, cancellation rule, and when withdrawal is available.
8. Only if the testnet contract is actually deployed and the participant explicitly opts in, guide them through a small faucet-funded test deposit. Confirm the receipt on the explorer. Otherwise mark this task “not run”; never pretend it happened.
9. Ask what was unclear, concerning, or missing. Thank the participant without asking for their financial profile.

## Task checklist

| Task | Success condition |
|---|---|
| Enter a purchase | Product and price accepted; analysis screen opens |
| Understand recommendation | Participant can identify result and at least one reason without prompting |
| Compare alternatives | Participant can state the assumption that future prices are unchanged |
| Create a savings goal | Plan appears with target, contribution, progress, and estimate |
| Understand onchain commitment | Participant distinguishes local rupee goal from public MON testnet deposit |
| Explain withdrawal | Participant identifies cancel, target completion, or deadline recovery rule |
| Complete testnet deposit | Only if deployed; successful receipt and explorer record verified |

## Short feedback questionnaire

Rate 1 (not at all) to 5 (very much):

- I understood the Buy / Wait / Don't Buy Yet result.
- I could tell which values were assumptions and which were entered by me.
- The emergency reserve explanation was clear.
- I understood the difference between a savings plan and an onchain deposit.
- I understood when and how vault funds can be withdrawn.
- I felt in control of the next step.

Open questions: What felt unclear? What information would you want before relying on this estimate? What would make you stop using the product? What should the team change first?

## Problem log template

| Code | Screen / task | What happened (observable) | Participant wording (short paraphrase) | Severity (1–3) | Likely cause | Next change | Retested? |
|---|---|---|---|---|---|---|---|
| U01 | | | | | | | |

Severity: 1 = cosmetic hesitation; 2 = task requires help or is misunderstood; 3 = user could misunderstand a material financial or withdrawal term. Do not write real names or sensitive financial values.
