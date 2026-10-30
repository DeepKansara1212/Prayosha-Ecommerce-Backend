export const calculateCashback = (eligibleSpend: number): number =>
  Math.round(Math.max(0, eligibleSpend) * 2) / 100;

export const calculateCashbackRedemption = (
  cashbackBalance: number,
  eligibleSubtotal: number
): number =>
  Math.round(Math.min(Math.max(0, cashbackBalance), Math.max(0, eligibleSubtotal)) * 50) /
  100;
