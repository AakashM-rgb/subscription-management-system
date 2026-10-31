import { format, parseISO, isAfter, isBefore, addDays, addWeeks, addMonths, addYears } from 'date-fns';
import { BillingFrequency } from '../types/database';

export function formatDate(dateString?: string | null, formatStr: string = 'dd MMM yyyy'): string {
  if (!dateString) return '—';
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    return format(date, formatStr);
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString?: string | null): string {
  if (!dateString) return '—';
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    return format(date, 'dd MMM yyyy, hh:mm a');
  } catch {
    return dateString;
  }
}

export function isOverdue(dueDateString?: string | null, status?: string): boolean {
  if (!dueDateString || status === 'paid' || status === 'cancelled') return false;
  try {
    const dueDate = parseISO(dueDateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return isBefore(dueDate, today);
  } catch {
    return false;
  }
}

export function calculateNextBillingDate(fromDate: Date | string, frequency: BillingFrequency): string {
  const baseDate = typeof fromDate === 'string' ? parseISO(fromDate) : fromDate;
  let nextDate: Date;
  switch (frequency) {
    case 'daily':
      nextDate = addDays(baseDate, 1);
      break;
    case 'weekly':
      nextDate = addWeeks(baseDate, 1);
      break;
    case 'monthly':
      nextDate = addMonths(baseDate, 1);
      break;
    case 'yearly':
      nextDate = addYears(baseDate, 1);
      break;
    default:
      nextDate = addMonths(baseDate, 1);
  }
  return format(nextDate, 'yyyy-MM-dd');
}

export function formatBillingPeriod(date: Date | string, frequency: BillingFrequency): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  switch (frequency) {
    case 'daily':
      return format(d, 'yyyy-MM-dd');
    case 'weekly':
      return `${format(d, 'dd MMM')} - ${format(addDays(d, 6), 'dd MMM yyyy')}`;
    case 'monthly':
      return format(d, 'MMMM yyyy');
    case 'yearly':
      return `${format(d, 'yyyy')} Annual`;
  }
}
