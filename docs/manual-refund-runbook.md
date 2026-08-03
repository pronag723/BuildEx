# BuildEx confirmed manual refund runbook

Use this workflow until an audited NOWPayments refund API integration replaces it. A dispute decision by itself never moves money.

1. Confirm the custom order is under an open dispute and the support decision is a full refund. Version 1 does not support partial awards.
2. Load the original paid payment record and verify its invoice, amount, asset, network, and buyer. Never infer the return network from a wallet label.
3. Obtain and independently verify the buyer's compatible refund destination through the authorized support process. Do not copy an address from an unrelated message or transaction.
4. Send the exact full refund through NOWPayments or the approved operations wallet. Preserve the provider response, transaction hash/reference, asset/network, amount, operator, and timestamp.
5. Wait for the provider or blockchain explorer to show the required confirmation. A created, queued, or broadcast-only transfer is not a completed refund.
6. In the BuildEx admin dispute panel, enter the confirmed provider/transaction reference and choose **Record completed refund**. The database will reject the resolution without a paid original transaction and a reference.
7. If the outbound transfer fails, do not resolve the dispute or change the order to refunded. Record the failed attempt, error, and timestamp in the incident log, correct the cause, and retry under a new reference.
8. Send both parties the recorded decision. Keep financial and dispute evidence for the applicable legal retention period.

Before production launch, operations must assign authorized refund operators, confirmation thresholds for each supported network, wallet-access controls, reconciliation ownership, and an incident escalation contact.
