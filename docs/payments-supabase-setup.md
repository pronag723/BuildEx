# BuildEx payments and builder withdrawals: exact production setup

This guide configures buyer checkout, builder balances, admin-approved USDT
withdrawals, the static-IP payout relay, and GitHub Pages. Do the sections in
order. Do not enter real card numbers anywhere in BuildEx.

## 1. Apply the Supabase SQL

1. Sign in at `https://supabase.com/dashboard`.
2. Click the BuildEx project.
3. In the left sidebar click **SQL Editor**.
4. Click **New query**.
5. Open each file below locally, copy the complete file, paste it into the query,
   and click **Run**. Run them in this exact order:
   1. `supabase/migrations/0031_payments.sql`
   2. `supabase/migrations/0033_payouts.sql`
   3. `supabase/migrations/0034_payment_reconciliation_and_fiat_payouts.sql`
   4. `supabase/migrations/0035_builder_withdrawals.sql`
6. If the project already has 0031–0034, run only 0035. The files are
   idempotent, but never run a later migration before an earlier one.
7. Create a final new query and run:

```sql
select to_regclass('public.payments') as payments,
       to_regclass('public.payouts') as payouts;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'get_my_payout_summary',
    'request_withdrawal',
    'admin_approve_withdrawal',
    'admin_reject_withdrawal'
  )
order by routine_name;
```

Both tables and all four routines must be returned.

## 2. Configure incoming payments in NOWPayments

Dashboard labels occasionally move. If a named item is absent, use the dashboard
search or contact NOWPayments before enabling production.

1. Sign in to NOWPayments with an email/password account. Google-only login is
   insufficient for the payout API.
2. Open **Settings → API keys** and click **Generate new key**. Copy the API key.
3. Open **Settings → Payment settings → IPN settings**.
4. Enable IPN and copy the IPN secret.
5. Set the callback URL to:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/payment-webhook`
6. Open **Settings → Coins settings**.
7. Enable **USDT (TRC-20)**. Its API currency code is `usdttrc20`.
8. Enable **USDT (ERC-20)** only if you intend to support its higher network fees.
   Its API currency code is `usdterc20`.
9. Open **Custody**, click **Activate Custody**, and complete any requested
   identity/business verification.
10. In custody/conversion settings, keep enough USDT on each enabled network to
    cover approved withdrawals. Do not assume TRC-20 funds can pay an ERC-20
    withdrawal without converting first.
11. Open **Security → Two-factor authentication**, click **Enable**, scan the QR
    code, enter the generated code, and save the recovery codes offline.
12. Ask NOWPayments support to enable **Mass Payouts** for the account.

Builder withdrawal fees are deducted from the requested amount. NOWPayments
charges no Mass Payout service fee, but blockchain network fees still apply.

## 3. Create the free Oracle static-IP relay

Supabase Edge Functions have no stable outbound IP, while NOWPayments Mass
Payouts require an allowlisted IP. The relay solves only that problem.

### Create the VM

1. Go to `https://cloud.oracle.com` and create/sign in to an Oracle Cloud account.
2. Select a home region with Always Free capacity.
3. Open the navigation menu and click **Compute → Instances**.
4. Click **Create instance**.
5. Name it `buildex-payout-relay`.
6. Under **Image and shape**, click **Edit**:
   - Image: **Canonical Ubuntu 22.04** or the current Ubuntu LTS.
   - Shape: **VM.Standard.E2.1.Micro (Always Free eligible)**. If available, an
     Always Free Ampere A1 shape is also acceptable.
7. Under **Networking**, leave **Assign a public IPv4 address** enabled.
8. Under **Add SSH keys**, select **Generate a key pair for me** and download the
   private key.
9. Click **Create** and wait for **Running**.
10. On the instance page, copy the public IPv4 address. If Oracle offers
    **Reserved public IP**, reserve this address so it cannot change.

### Open HTTPS

1. On the instance page click its subnet.
2. Click the attached **Security List → Add ingress rules**.
3. Add TCP port `443` from `0.0.0.0/0`.
4. Add TCP port `80` from `0.0.0.0/0` for certificate issuance.
5. Keep SSH port `22`; restrict its source CIDR to your own IP when possible.

### Add a hostname

Create an `A` record such as `payouts.example.com` pointing to the VM IPv4. A
free DuckDNS hostname is acceptable. Wait until:

```powershell
nslookup payouts.example.com
```

returns the VM IPv4.

### Install the relay

SSH from PowerShell:

```powershell
ssh -i C:\path\oracle.key ubuntu@YOUR_VM_IP
```

On the VM:

```bash
sudo apt update
sudo apt install -y curl git debian-keyring debian-archive-keyring apt-transport-https
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
sudo useradd --system --home /var/lib/buildex-payout-relay --shell /usr/sbin/nologin buildex-relay
sudo mkdir -p /opt/buildex-payout-relay /var/lib/buildex-payout-relay
sudo chown buildex-relay:buildex-relay /var/lib/buildex-payout-relay
git clone https://github.com/pronag723/BuildEx.git /tmp/BuildEx
sudo cp -R /tmp/BuildEx/services/payout-relay/. /opt/buildex-payout-relay/
```

Confirm `node --version` reports version 22 or newer. Then:

```bash
openssl rand -hex 32
sudo nano /etc/buildex-payout-relay.env
```

Paste the following, using the generated value and real NOWPayments credentials:

```env
PORT=8787
RELAY_SHARED_SECRET=PASTE_THE_64_CHARACTER_RANDOM_VALUE
NOWPAYMENTS_API_KEY=PASTE_API_KEY
NOWPAYMENTS_EMAIL=YOUR_NOWPAYMENTS_LOGIN_EMAIL
NOWPAYMENTS_PASSWORD=YOUR_NOWPAYMENTS_LOGIN_PASSWORD
STATE_FILE=/var/lib/buildex-payout-relay/state.json
```

Lock it down and install the service:

```bash
sudo chmod 600 /etc/buildex-payout-relay.env
sudo cp /opt/buildex-payout-relay/buildex-payout-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now buildex-payout-relay
sudo systemctl status buildex-payout-relay --no-pager
```

Configure Caddy:

```bash
sudo nano /etc/caddy/Caddyfile
```

Paste:

```caddy
payouts.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Then run:

```bash
sudo systemctl reload caddy
curl https://payouts.example.com/health
```

The response must be `{"ok":true}`. Never expose port 8787 publicly.

For future relay updates:

```bash
cd /tmp/BuildEx
git pull origin main
sudo cp -R services/payout-relay/. /opt/buildex-payout-relay/
sudo systemctl restart buildex-payout-relay
curl https://payouts.example.com/health
```

### Whitelist the relay and wallets

1. In NOWPayments click **Settings → Whitelist**.
2. Under **IP whitelist**, click **Add IP**, enter the Oracle VM IPv4, and confirm
   with 2FA.
3. NOWPayments also requires approved payout wallets. Before approving a builder
   request, copy its full wallet from BuildEx Admin.
4. In **Settings → Whitelist → Wallet addresses**, click **Add address**.
5. Select the exact network—**USDT TRC-20** or **USDT ERC-20**—paste the address,
   and confirm it. A wallet approved on one network is not approved on the other.

## 4. Add Supabase Edge Function secrets

1. In Supabase open **Edge Functions**.
2. Click **Secrets** (or **Manage secrets**).
3. Add:

| Name | Value |
|---|---|
| `NOWPAYMENTS_API_KEY` | API key from section 2 |
| `NOWPAYMENTS_IPN_SECRET` | IPN secret from section 2 |
| `PAYOUT_RELAY_URL` | `https://payouts.example.com` |
| `PAYOUT_RELAY_SHARED_SECRET` | the same 64-character relay secret |

NOWPayments email/password belong only on the Oracle relay, not in Supabase.

Deploy from the repository root:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy create-invoice
npx supabase functions deploy payment-webhook --no-verify-jwt
npx supabase functions deploy create-payout
npx supabase functions deploy verify-payout
npx supabase functions deploy reconcile-payout
```

In Supabase **Edge Functions**, verify all five functions exist. Open each
function and click **Logs** after testing. `payment-webhook` must have JWT
verification off; the other four must have it on.

## 5. Configure GitHub Pages

1. Open the GitHub repository.
2. Click **Settings → Secrets and variables → Actions**.
3. Under **Repository secrets**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` =
     `https://YOUR_PROJECT_REF.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the Supabase publishable/anon key from
     **Supabase → Project Settings → API**
4. Under **Variables**, add `NEXT_PUBLIC_PAYMENTS_ENABLED` with value `true`.
5. In GitHub click **Actions → Deploy to GitHub Pages → Run workflow**.
6. Select branch `main`, click **Run workflow**, and wait for both build and
   deploy jobs to turn green.
7. Only after a successful real checkout test, run migration
   `0032_revoke_mock_payment.sql`.

## 6. Test the complete flow

1. Use a builder account and complete a real paid order.
2. Open **Account → Payouts**. The builder earnings must appear under
   **Available**; no withdrawal should be created automatically.
3. Save a test wallet on the correct network.
4. Request exactly `$20.00`. Available balance must drop by $20 and Pending must
   rise by $20.
5. Sign in as admin and open **Admin → Payouts**.
6. Verify and whitelist the exact wallet/network in NOWPayments.
7. Check the current network fee shown by NOWPayments. Click **Approve** and enter
   that fee in USD; BuildEx subtracts it from the builder's gross request. Select
   the approved request, then click **Create payout batch**. Use a conservative
   fee amount—never approve with `$0` unless NOWPayments confirms no network fee.
8. Enter the NOWPayments 2FA code and click **Confirm 2FA**.
9. Wait for NOWPayments to finish, then click **Reconcile**.
10. Confirm the request reads **Sent**, the builder's Pending balance drops, and
    Lifetime paid increases.
11. Also test rejection and cancellation; both must restore available balance.

## 7. EUR SEPA status

BuildEx displays EUR SEPA as unavailable. Do not enable it merely because
NOWPayments has enabled merchant off-ramp.

To inspect the provider flow, use **Fiat Operations → Off-Ramp → Add account**,
select **Guardarian**, choose currency **EUR**, enter bank name/type **SEPA**, and
provide IBAN/SWIFT. That published flow links the merchant's bank account. Obtain
written NOWPayments approval for marketplace beneficiaries and a supported API
contract before adding builder bank details or enabling requests.

## Troubleshooting and rollback

- `401` from the relay: the Supabase and relay shared secrets differ, or the VM
  clock is wrong. Run `timedatectl status`.
- NOWPayments rejects the source IP: compare the VM IPv4 with
  **Settings → Whitelist**.
- NOWPayments rejects a wallet: whitelist the exact address on the exact network.
- Request remains Processing: inspect `reconcile-payout` logs and click
  **Reconcile** after the provider reaches a terminal status.
- Insufficient balance: fund or convert the matching custody currency.
- To pause payouts without losing balances, stop the relay with
  `sudo systemctl stop buildex-payout-relay`. Builders can still request and
  admins can review, but no provider batch can be created.
