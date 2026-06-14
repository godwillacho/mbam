export function calculatePendingAmount(totalAmount: number, amountPaid: number): number {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return 0;
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) return totalAmount;
  return Math.max(totalAmount - amountPaid, 0);
}
