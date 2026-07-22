export interface LineRow {
  _key: string;
  itemCode: string;
  itemDescription: string;
  unit: string;
  /** One serial for the whole line, or one per unit while it is being edited. */
  serialNumber: string | string[];
  itemId?: string;
  productId?: string;
  [key: string]: any;
}

export interface LineColumn {
  key: string;
  label: string;
  /**
   * `readonly` cells are auto-filled from the catalog and not editable;
   * `serial` cells take one serial per unit once the line's quantity exceeds 1;
   * `select` cells need `options`.
   */
  type?: 'text' | 'number' | 'readonly' | 'serial' | 'date' | 'select';
  width?: string;
  /** Choices for a `select` cell. */
  options?: string[];
  /** Upper bound for number cells, e.g. cannot transfer more than stock. */
  max?: (row: LineRow) => number | undefined;
  /** Warning shown under a number cell, e.g. a saved line that now exceeds stock. */
  warn?: (row: LineRow) => string | undefined;
  /** For `serial` cells: the row key holding the unit count the serials cover. */
  qtyKey?: string;
  /** Tooltip on the column header. */
  hint?: string;
  /**
   * Dropped from the printed document. For working figures that help while the
   * form is being filled in but have no place on the paper record — what stock
   * happened to be on hand the day it was typed, say.
   */
  hideOnPrint?: boolean;
}

/**
 * Serials round-trip as a single comma-separated string (what the backend stores
 * and every list, print view and export reads), but are edited as one value per
 * unit. Both shapes are read through this.
 */
export const splitSerials = (value: string | string[] | undefined): string[] =>
  (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map(serial => serial.trim())
    .filter(Boolean);

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
