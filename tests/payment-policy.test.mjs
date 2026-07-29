import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("checkout policy keeps the $5 floor and a curated popular-currency catalog", async () => {
  const [pricing, rails, invoice, provider] = await Promise.all([
    read("lib/pricing.js"),
    read("supabase/functions/_shared/paymentRails.ts"),
    read("supabase/functions/create-invoice/index.ts"),
    read("supabase/functions/_shared/nowpayments.ts"),
  ]);
  assert.match(pricing, /MIN_ORDER_CENTS\s*=\s*500/);
  assert.match(rails, /code:\s*"usdtbsc".*recommended:\s*true/);
  assert.match(rails, /code:\s*"usdttrc20"/);
  assert.match(rails, /code:\s*"btc"/);
  assert.match(rails, /code:\s*"eth"/);
  assert.match(rails, /code:\s*"sol"/);
  assert.match(invoice, /isPaymentRailCode\(payCurrency\)/);
  assert.match(invoice, /MIN_CENTS\s*=\s*500/);
  assert.doesNotMatch(provider, /is_fee_paid_by_user:\s*true/);
  assert.match(provider, /is_fee_paid_by_user:\s*"false"/);
  assert.match(provider, /outcomeCurrency\s*=\s*payCurrency/);
});

test("payment options and invoice both perform live eligibility checks", async () => {
  const [options, invoice] = await Promise.all([
    read("supabase/functions/payment-options/index.ts"),
    read("supabase/functions/create-invoice/index.ts"),
  ]);
  assert.match(options, /getPaymentRailOptions\(amountCents\)/);
  assert.match(options, /filter\(\(option\) => option\.available\)/);
  assert.match(invoice, /getPaymentRailOptions\(Number\(order\.price_kopecks\)\)/);
  assert.match(invoice, /selected\?\.available/);
});

test("payout policy is BSC-only, fee-free to builders, and batched idempotently", async () => {
  const [migration, relay, payout, relayClient] = await Promise.all([
    read("supabase/migrations/0072_low_fee_stablecoin_payments.sql"),
    read("services/payout-relay/server.mjs"),
    read("supabase/functions/create-payout/index.ts"),
    read("supabase/functions/_shared/payoutRelay.ts"),
  ]);
  assert.match(migration, /payout_method = 'usdt_bsc'/);
  assert.match(migration, /\^0x\[0-9a-fA-F\]\{40\}\$/);
  assert.match(migration, /p_fee_amount_cents,\s*0\) <> 0/);
  assert.match(migration, /net_amount_cents = amount_cents/);
  assert.match(relay, /item\.currency !== "usdtbsc"/);
  assert.match(payout, /payoutIdempotencyKey/);
  assert.match(payout, /claim_payout_batch/);
  assert.match(payout, /release_payout_claim/);
  assert.match(migration, /One or more payouts have already been claimed/);
  assert.match(relayClient, /\[\.\.\.ids\]\.sort\(\)\.join\(","\)/);
});

test("signed provider events retain reconciliation metadata without releasing partials", async () => {
  const [provider, webhook, migration] = await Promise.all([
    read("supabase/functions/_shared/nowpayments.ts"),
    read("supabase/functions/payment-webhook/index.ts"),
    read("supabase/migrations/0072_low_fee_stablecoin_payments.sql"),
  ]);
  assert.match(provider, /status === "finished"/);
  assert.match(provider, /currency === "usd"/);
  assert.match(provider, /payload\.actually_paid/);
  assert.match(webhook, /record_payment_event/);
  assert.match(webhook, /if \(!verdict\.isPaid\)/);
  assert.match(migration, /provider_payment_id text/);
  assert.match(migration, /actual_received_currency text/);
  assert.match(migration, /Signed payment rail does not match the requested rail/);
});

test("managed studio commission cannot undercut the Master fee floor", async () => {
  const [migration, consoleUi] = await Promise.all([
    read("supabase/migrations/0073_trc20_bsc_checkout_policy.sql"),
    read("app/admin/components/StudiosConsole.jsx"),
  ]);
  assert.match(migration, /platform_commission_bps between 900 and 10000/);
  assert.match(migration, /p_platform_commission_bps not between 900 and 10000/);
  assert.match(consoleUi, /bps < 900/);
  assert.match(consoleUi, /min="9"/);
});
