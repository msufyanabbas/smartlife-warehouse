import { ObjectLiteral, Repository } from 'typeorm';

/**
 * Builds the next sequential document reference, e.g. GRN-2025-0001.
 * Zero-padding keeps the numeric suffix lexicographically sortable, which is
 * what lets the `ORDER BY <field> DESC` below find the true maximum.
 */
export async function generateRefNumber<T extends ObjectLiteral>(
  repository: Repository<T>,
  field: string,
  prefix: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;

  const last = await repository
    .createQueryBuilder('e')
    .where(`e.${field} LIKE :pattern`, { pattern })
    .orderBy(`e.${field}`, 'DESC')
    .getOne();

  let nextNum = 1;
  if (last) {
    const parts = String(last[field]).split('-');
    const parsed = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(parsed)) nextNum = parsed + 1;
  }

  return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
}
