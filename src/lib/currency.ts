/**
 * Currency formatting utilities for Subflow (Brightloop Software)
 */

export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string = 'INR',
  locale: string = 'en-IN'
): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0;
  if (isNaN(numericAmount)) return '₹0.00';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericAmount);
}

export function formatCompactCurrency(
  amount: number | string | null | undefined,
  currency: string = 'INR'
): string {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0;
  if (isNaN(numericAmount)) return '₹0';

  if (Math.abs(numericAmount) >= 10000000) {
    return `₹${(numericAmount / 10000000).toFixed(2)} Cr`;
  }
  if (Math.abs(numericAmount) >= 100000) {
    return `₹${(numericAmount / 100000).toFixed(2)} L`;
  }
  if (Math.abs(numericAmount) >= 1000) {
    return `₹${(numericAmount / 1000).toFixed(1)}k`;
  }
  return formatCurrency(numericAmount, currency);
}
