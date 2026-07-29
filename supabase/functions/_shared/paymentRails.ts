import {
  getAvailableDepositCurrencies,
  getMinimumInvoiceAmount,
} from "./nowpayments.ts";

export const PAYMENT_RAILS = [
  { code: "usdtbsc", displayName: "USDT on BSC (BEP-20)", recommended: true },
  { code: "usdtmatic", displayName: "USDT on Polygon", recommended: false },
  { code: "usdtsol", displayName: "USDT on Solana", recommended: false },
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
