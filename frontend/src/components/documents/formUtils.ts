import { splitSerials } from './lineRows';

/** Empty strings fail backend @IsUUID / @IsDateString validation — send nothing instead. */
export const orUndefined = (value?: string) => (value ? value : undefined);

export const today = () => new Date().toISOString().split('T')[0];

/** `date` columns come back as `YYYY-MM-DD`; guard against full ISO timestamps. */
export const toDateInput = (value?: string) => (value ? value.split('T')[0] : '');

export const fullName = (user?: { firstName: string; lastName: string }) =>
  user ? `${user.firstName} ${user.lastName}` : '—';

export const uniqueSorted = (values: (string | undefined)[]) =>
  [...new Set(values.filter(Boolean) as string[])].sort();

/**
 * `YYYY-MM-DD` read as local midnight — `new Date()` treats a bare date as UTC
 * and shifts it a day west of Greenwich. Full timestamps pass through.
 */
export function printDate(value?: string): string {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Serials round-trip as one comma-separated string; print them the same way. */
export const printSerials = (value: unknown): string =>
  splitSerials(value as string | string[] | undefined).join(', ');
