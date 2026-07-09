export interface LineRow {
  _key: string;
  itemCode: string;
  itemDescription: string;
  unit: string;
  serialNumber: string;
  itemId?: string;
  productId?: string;
  [key: string]: any;
}

export interface LineColumn {
  key: string;
  label: string;
  /** `readonly` cells are auto-filled from the catalog and not editable. */
  type?: 'text' | 'number' | 'readonly';
  width?: string;
  /** Upper bound for number cells, e.g. cannot transfer more than stock. */
  max?: (row: LineRow) => number | undefined;
}

let keyCounter = 0;
const nextKey = () => `row-${keyCounter++}`;

export const emptyRow = (extra: Record<string, any> = {}): LineRow => ({
  _key: nextKey(),
  itemCode: '',
  itemDescription: '',
  unit: '',
  serialNumber: '',
  ...extra,
});

/** Server rows carry no client key and may omit fields the table renders. */
export const toLineRows = (
  items: any[] | undefined,
  minRows: number,
  extra: Record<string, any> = {},
): LineRow[] => {
  const rows = (items ?? []).map(item => ({ ...emptyRow(extra), ...item, _key: nextKey() }));
  while (rows.length < minRows) rows.push(emptyRow(extra));
  return rows;
};

/** Rows the user never touched are dropped rather than saved as blanks. */
export const stripEmptyRows = (rows: LineRow[]) =>
  rows
    .filter(row => row.itemCode.trim() || row.itemDescription.trim())
    .map(row => {
      const payload = { ...row };
      delete (payload as Partial<LineRow>)._key;
      return payload;
    });
