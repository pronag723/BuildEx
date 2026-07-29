import {
  getAvailableDepositCurrencies,
  getMinimumInvoiceAmount,
} from "./nowpayments.ts";

export const PAYMENT_RAILS = [
  // Only expose a deliberate, supportable catalog. A rail must additionally be
  // enabled in the merchant's NOWPayments account and meet its live minimum.
  { code: "usdttrc20", symbol: "USDT", displayName: "Tether", network: "TRON (TRC-20)", logo: "usdt", recommended: true },
  { code: "usdtbsc", symbol: "USDT", displayName: "Tether", network: "BNB Smart Chain (BEP-20)", logo: "usdt", recommended: true },
  { code: "usdc", symbol: "USDC", displayName: "USD Coin", network: "Ethereum", logo: "usdc", recommended: false },
  { code: "btc", symbol: "BTC", displayName: "Bitcoin", network: "Bitcoin", logo: "btc", recommended: false },
  { code: "eth", symbol: "ETH", displayName: "Ethereum", network: "Ethereum", logo: "eth", recommended: false },
  { code: "sol", symbol: "SOL", displayName: "Solana", network: "Solana", logo: "sol", recommended: false },
  { code: "ton", symbol: "TON", displayName: "Toncoin", network: "TON", logo: "ton", recommended: false },
  { code: "trx", symbol: "TRX", displayName: "TRON", network: "TRON", logo: "trx", recommended: false },
  { code: "xrp", symbol: "XRP", displayName: "XRP", network: "XRP Ledger", logo: "xrp", recommended: false },
  { code: "ltc", symbol: "LTC", displayName: "Litecoin", network: "Litecoin", logo: "ltc", recommended: false },
  { code: "doge", symbol: "DOGE", displayName: "Dogecoin", network: "Dogecoin", logo: "doge", recommended: false },
  { code: "ada", symbol: "ADA", displayName: "Cardano", network: "Cardano", logo: "ada", recommended: false },
  { code: "bch", symbol: "BCH", displayName: "Bitcoin Cash", network: "Bitcoin Cash", logo: "bch", recommended: false },
] as const;

export type PaymentRailCode = typeof PAYMENT_RAILS[number]["code"];

export function isPaymentRailCode(value: unknown): value is PaymentRailCode {
  return PAYMENT_RAILS.some((rail) => rail.code === String(value).toLowerCase());
}

export async function getPaymentRailOptions(amountCents: number) {
  const availableCurrencies = await getAvailableDepositCurrencies();
  const checks = await Promise.all(PAYMENT_RAILS.map(async (rail) => {
    if (!availableCurrencies.has(rail.code)) {
      return { ...rail, liveMinimumUsd: null, available: false };
    }
    try {
      const quote = await getMinimumInvoiceAmount(rail.code);
      const liveMinimumUsd = quote.amount;
      return {
        ...rail,
        liveMinimumUsd,
        available: liveMinimumUsd != null &&
          liveMinimumUsd * 100 <= amountCents + 0.001,
      };
    } catch (error) {
      console.error(`Minimum lookup failed for ${rail.code}:`, error);
      return { ...rail, liveMinimumUsd: null, available: false };
    }
  }));
  return checks;
}
