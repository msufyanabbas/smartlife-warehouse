import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Plus, X } from 'lucide-react';
import FloatingDropdown from '../FloatingDropdown';
import SerialNumbers from '../SerialNumbers';
import { useInventory, useProductSearch } from '../../hooks/useApi';
import { emptyRow, splitSerials, type LineColumn, type LineRow } from './lineRows';

interface CatalogProduct {
  id: string; name: string; sku: string; description?: string;
  unit?: string; brand?: string;
  category?: { name: string; parent?: { name: string } };
}

interface StockItem {
  id: string; name: string; sku: string; description?: string;
  serialNumber?: string; schemeNo?: string; projectName?: string;
  availableQuantity: number; isActive: boolean;
  product?: { unit?: string };
}

// ── Item code autocomplete ─────────────────────────────────────────────────
function ItemCodePicker({ row, source, filterStock, onPick, readOnly, usedIds, stockField }: {
  row: LineRow;
  source: 'products' | 'inventory';
  filterStock?: (item: StockItem) => boolean;
  onPick: (patch: Partial<LineRow>) => void;
  readOnly?: boolean;
  usedIds: string[];
  stockField?: string;
}) {
  const [query, setQuery] = useState(row.itemCode);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only one of the two sources actually fetches: an empty query disables the
  // product search, and the inventory list is a shared cached query.
  const { data: products = [] } = useProductSearch(source === 'products' ? query : '');
  const { data: stock = [] } = useInventory();

  const selectedId = row.productId || row.itemId;

  const productOptions = (products as CatalogProduct[])
    .filter(p => !usedIds.includes(p.id) || p.id === selectedId);

  const q = query.trim().toLowerCase();
  const stockOptions = (stock as StockItem[])
    .filter(i => i.isActive && (i.availableQuantity > 0 || i.id === selectedId))
    .filter(i => !filterStock || filterStock(i))
    .filter(i => !usedIds.includes(i.id) || i.id === selectedId)
    .filter(i => !q || i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
    .slice(0, 10);

  const pickProduct = (p: CatalogProduct) => {
    setQuery(p.sku);
    setOpen(false);
    onPick({
      productId: p.id,
      itemCode: p.sku,
      itemDescription: p.name,
      unit: p.unit || '',
    });
  };

  // Each document names the on-hand figure differently (`stockAvailable` on an
  // assignment, `stockQty` on a transfer) and the backend rejects any field its
  // DTO does not declare, so write only the key this form actually asked for.
  const pickStock = (i: StockItem) => {
    setQuery(i.sku);
    setOpen(false);
    onPick({
      itemId: i.id,
      itemCode: i.sku,
      itemDescription: i.name,
      unit: i.product?.unit || '',
      serialNumber: i.serialNumber || '',
      ...(stockField ? { [stockField]: i.availableQuantity } : {}),
    });
  };

  const clear = () => {
    setQuery('');
    setOpen(false);
    onPick({
      productId: undefined, itemId: undefined,
      itemCode: '', itemDescription: '', unit: '', serialNumber: '',
      ...(stockField ? { [stockField]: 0 } : {}),
    });
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (readOnly) {
    return <div style={{ padding: '5px 7px', fontSize: 12 }}>{row.itemCode}</div>;
  }

  const hasOptions = source === 'products' ? productOptions.length > 0 : stockOptions.length > 0;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        ref={inputRef}
        className="doc-input"
        style={{ paddingRight: selectedId ? 34 : 18 }}
        value={query}
        placeholder="Code…"
        onChange={e => {
          const value = e.target.value;
          setQuery(value);
          // Free text is kept so non-catalog codes can still be entered.
          onPick(value ? { itemCode: value } : { itemCode: '', productId: undefined, itemId: undefined });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      <div style={{ position: 'absolute', right: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        {selectedId && <CheckCircle size={12} style={{ color: 'var(--green)' }} />}
        {query && (
          <button type="button" onClick={clear} title="Clear row"
            style={{ background: 'none', border: 'none', color: '#94a3b8', display: 'flex', padding: 0 }}>
            <X size={11} />
          </button>
        )}
      </div>

      <FloatingDropdown anchorRef={inputRef} visible={open}>
        {hasOptions ? (
          source === 'products'
            ? productOptions.map(p => (
                <div key={p.id} onMouseDown={() => pickProduct(p)} style={optionStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <div style={optionTitle}>{p.name}</div>
                  <div style={optionMeta}>
                    <span>SKU: <code style={{ color: 'var(--accent)' }}>{p.sku}</code></span>
                    {p.unit && <span>Unit: {p.unit}</span>}
                    {p.brand && <span>{p.brand}</span>}
                  </div>
                </div>
              ))
            : stockOptions.map(i => (
                <div key={i.id} onMouseDown={() => pickStock(i)} style={optionStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <div style={optionTitle}>{i.name}</div>
                  <div style={optionMeta}>
                    <span>SKU: <code style={{ color: 'var(--accent)' }}>{i.sku}</code></span>
                    <span>Available: <strong style={{ color: 'var(--green)' }}>{i.availableQuantity}</strong></span>
                    {i.serialNumber && <span>SN: {i.serialNumber}</span>}
                  </div>
                </div>
              ))
        ) : (
          <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-3)' }}>
            {source !== 'products'
              ? 'No stock available at this location'
              : !query.trim()
                ? 'Type a code or name to search the catalog…'
                : 'No matching product in the catalog'}
          </div>
        )}
      </FloatingDropdown>
    </div>
  );
}

const optionStyle: React.CSSProperties = {
  padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
};
const optionTitle: React.CSSProperties = { fontWeight: 600, fontSize: 13, color: 'var(--text)' };
const optionMeta: React.CSSProperties = {
  display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-3)', marginTop: 3, flexWrap: 'wrap',
};

// ── Table ──────────────────────────────────────────────────────────────────
export default function LineItemsTable({
  rows, onChange, columns, source, filterStock,
  minRows = 15, readOnly = false, totalKey, totalLabel,
  newRowDefaults = {}, stockField,
}: {
  rows: LineRow[];
  onChange: (rows: LineRow[]) => void;
  columns: LineColumn[];
  source: 'products' | 'inventory';
  filterStock?: (item: StockItem) => boolean;
  minRows?: number;
  readOnly?: boolean;
  totalKey?: string;
  totalLabel?: string;
  newRowDefaults?: Record<string, any>;
  /** Row key the picked item's on-hand quantity is written to, if the form shows one. */
  stockField?: string;
}) {
  const usedIds = rows.map(r => r.productId || r.itemId).filter(Boolean) as string[];

  const patchRow = (index: number, patch: Partial<LineRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const addRow = () => onChange([...rows, emptyRow(newRowDefaults)]);

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length >= minRows ? next : [...next, emptyRow(newRowDefaults)]);
  };

  const total = totalKey
    ? rows.reduce((sum, r) => sum + (Number(r[totalKey]) || 0), 0)
    : 0;

  const totalIndex = totalKey ? columns.findIndex(c => c.key === totalKey) : -1;
  const trailingCols = columns.length - totalIndex - 1 + (readOnly ? 0 : 1);

  return (
    <div>
      <table className="doc-table">
        <colgroup>
          <col style={{ width: 34 }} />
          {columns.map(c => <col key={c.key} style={{ width: c.width }} />)}
          {!readOnly && <col style={{ width: 28 }} className="no-print" />}
        </colgroup>
        <thead>
          <tr>
            <th>#</th>
            {columns.map(c => <th key={c.key} title={c.hint}>{c.label}</th>)}
            {!readOnly && <th className="no-print" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row._key}>
              <td className="doc-cell-num">{index + 1}</td>
              {columns.map((col, colIndex) => (
                <td key={col.key}>
                  {colIndex === 0 ? (
                    <ItemCodePicker
                      row={row}
                      source={source}
                      filterStock={filterStock}
                      readOnly={readOnly}
                      usedIds={usedIds}
                      stockField={stockField}
                      onPick={patch => patchRow(index, patch)}
                    />
                  ) : (
                    <Cell
                      row={row}
                      column={col}
                      readOnly={readOnly}
                      onChange={value => patchRow(index, { [col.key]: value })}
                    />
                  )}
                </td>
              ))}
              {!readOnly && (
                <td className="no-print">
                  <button type="button" className="doc-row-remove"
                    onClick={() => removeRow(index)} title="Remove row">
                    <X size={12} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {totalIndex >= 0 && (
          <tfoot>
            <tr>
              <td colSpan={totalIndex + 1} style={{ textAlign: 'right' }}>
                {totalLabel ?? 'Total'}
              </td>
              <td style={{ textAlign: 'center' }}>{total}</td>
              {trailingCols > 0 && <td colSpan={trailingCols} />}
            </tr>
          </tfoot>
        )}
      </table>

      {!readOnly && (
        <button type="button" className="btn btn-ghost btn-sm no-print"
          style={{ marginTop: 10 }} onClick={addRow}>
          <Plus size={13} /> Add Row
        </button>
      )}
    </div>
  );
}

// ── Serial numbers ─────────────────────────────────────────────────────────
/**
 * A line can cover many units (100 remotes against one SKU) and each unit can
 * carry its own serial. Below two units there is nothing to choose, so the cell
 * is a plain input; above it the user says whether the serial they type covers
 * the whole line or whether they want a slot per unit.
 *
 * The row holds a string ("one for all") or an array (one per unit); the backend
 * flattens both into the same comma-separated field.
 */
function SerialNumberCell({ qty, value, onChange }: {
  qty: number;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  // A saved line comes back as "SN-1, SN-2, SN-3", so more than one serial means
  // it was last filled in per unit and should reopen that way.
  const [perUnit, setPerUnit] = useState(() => splitSerials(value).length > 1);

  const serials = splitSerials(value);
  const firstSerial = Array.isArray(value) ? (value[0] ?? '') : value;
  const unitSerial = (index: number) =>
    (Array.isArray(value) ? value[index] : serials[index]) ?? '';

  // Re-slot when the quantity changes under the serials, so what is stored never
  // covers more or fewer units than the line actually has.
  useEffect(() => {
    if (!perUnit || !Array.isArray(value) || value.length === qty) return;
    onChange(Array.from({ length: qty }, (_, i) => value[i] ?? ''));
  }, [perUnit, qty, value, onChange]);

  const modeButton = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, fontSize: 10, padding: '2px 4px', borderRadius: 4, cursor: 'pointer',
        border: '1px solid var(--border)',
        background: active ? 'var(--accent)' : 'var(--bg-3)',
        color: active ? '#fff' : 'var(--text-2)',
      }}
    >
      {label}
    </button>
  );

  if (qty <= 1) {
    return (
      <input
        className="doc-input"
        style={{ fontFamily: 'monospace' }}
        value={firstSerial}
        placeholder="Serial No."
        onChange={e => onChange(e.target.value)}
      />
    );
  }

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {modeButton('One for all', !perUnit, () => {
          setPerUnit(false);
          onChange(firstSerial);
        })}
        {modeButton(`Per unit (${qty})`, perUnit, () => {
          setPerUnit(true);
          onChange(Array.from({ length: qty }, (_, i) => serials[i] ?? ''));
        })}
      </div>

      {perUnit ? (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 2,
          maxHeight: 120, overflowY: 'auto',
          background: 'var(--bg-3)', borderRadius: 4, padding: 4,
        }}>
          {Array.from({ length: qty }, (_, i) => (
            <input
              key={i}
              className="doc-input"
              style={{ fontFamily: 'monospace', fontSize: 11, padding: '2px 6px' }}
              value={unitSerial(i)}
              placeholder={`Unit ${i + 1}`}
              onChange={e => {
                const next = Array.from({ length: qty }, (_, k) => unitSerial(k));
                next[i] = e.target.value;
                onChange(next);
              }}
            />
          ))}
        </div>
      ) : (
        <input
          className="doc-input"
          style={{ fontFamily: 'monospace' }}
          value={firstSerial}
          placeholder="Serial (all units)"
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function Cell({ row, column, readOnly, onChange }: {
  row: LineRow;
  column: LineColumn;
  readOnly: boolean;
  onChange: (value: any) => void;
}) {
  const value = row[column.key];

  if (column.type === 'serial' && readOnly) {
    return (
      <div style={{ padding: '5px 7px', fontSize: 12 }}>
        <SerialNumbers value={value} empty=" " />
      </div>
    );
  }

  if (column.type === 'serial') {
    return (
      <SerialNumberCell
        qty={Number(column.qtyKey ? row[column.qtyKey] : 0) || 0}
        value={value ?? ''}
        onChange={onChange}
      />
    );
  }

  if (readOnly || column.type === 'readonly') {
    const text = column.type === 'number' ? (value || 0) : (value || '');
    return (
      <div style={{ padding: '5px 7px', fontSize: 12, textAlign: column.type === 'number' ? 'center' : 'left' }}>
        {text || ' '}
      </div>
    );
  }

  if (column.type === 'number') {
    const max = column.max?.(row);
    return (
      <input
        type="number"
        className="doc-input"
        style={{ textAlign: 'center' }}
        min={0}
        max={max}
        placeholder="0"
        value={value === 0 || value == null ? '' : value}
        onChange={e => {
          const parsed = e.target.value === '' ? 0 : Number(e.target.value);
          if (Number.isNaN(parsed) || parsed < 0) return;
          onChange(max != null ? Math.min(parsed, max) : parsed);
        }}
      />
    );
  }

  return (
    <input
      className="doc-input"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
    />
  );
}
