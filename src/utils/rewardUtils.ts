export const MIN_REDEMPTION_POINTS = 250;

export const calculatePoints = (orderTotal: number): number => {
  return Math.floor(orderTotal / 5);
};
