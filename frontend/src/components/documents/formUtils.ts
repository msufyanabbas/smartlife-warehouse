/** Empty strings fail backend @IsUUID / @IsDateString validation — send nothing instead. */
export const orUndefined = (value?: string) => (value ? value : undefined);

export const today = () => new Date().toISOString().split('T')[0];

/** `date` columns come back as `YYYY-MM-DD`; guard against full ISO timestamps. */
export const toDateInput = (value?: string) => (value ? value.split('T')[0] : '');

export const fullName = (user?: { firstName: string; lastName: string }) =>
  user ? `${user.firstName} ${user.lastName}` : '—';

export const uniqueSorted = (values: (string | undefined)[]) =>
  [...new Set(values.filter(Boolean) as string[])].sort();
