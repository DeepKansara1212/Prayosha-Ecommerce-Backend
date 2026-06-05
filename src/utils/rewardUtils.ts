export const calculatePoints = (orderTotal: number): number => {
  return Math.floor(orderTotal / 5);
};
