import type { CSSProperties, ReactNode } from 'react';

/**
 * The paper rendering of a warehouse document — the thing that comes out of the
 * printer, as opposed to the editor the figures were typed into.
 *
 * It is deliberately a separate render rather than a print stylesheet over the
 * editor. What belongs on a record and what helps while filling one in are
 * different sets: the editor needs dropdowns, blank rows to type into and
 * working figures like on-hand stock; the record needs none of them. Trying to
 * suppress all that with `@media print` is what leaves half-hidden inputs and
 * empty rows on the page.
 *
 * Every document uses the same skeleton, so the four forms differ only in the
 * props they hand over.
 */

const INK = '#1a1a3e';
const MUTED = '#9ca3af';
const LINE = '#e5e7eb';
const FIELD_COLUMNS = 3;

export interface PrintField {
  label: string;
  value?: string | number | null;
}

/** A titled block of fields — the transfer form's FROM and TO halves. */
export interface PrintFieldGroup {
  title: string;
  fields: PrintField[];
}

export interface PrintColumn {
  key: string;
  label: string;
  align?: 'left' | 'center';
  width?: string;
  /** Emphasised in the body — the figure the document is actually about. */
  strong?: boolean;
  render?: (row: Record<string, unknown>) => string;
}

export interface PrintBox {
  label: string;
  value?: string;
  minHeight?: number;
}

export interface PrintDocumentProps {
  /** "ASSIGNMENT NO.", "GRN NO." … */
  docLabel: string;
  docNumber?: string;
  title: string;
  fieldGroups?: PrintFieldGroup[];
  fields?: PrintField[];
  purpose?: PrintBox;
  notes?: PrintBox;
  columns: PrintColumn[];
  rows: Record<string, unknown>[];
  totalKey?: string;
  totalLabel?: string;
  signatures: string[];
  /** Renders on screen too, for the Preview toggle. */
  preview?: boolean;
}

const labelStyle: CSSProperties = {
  fontSize: 10,
  color: MUTED,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 600,
};

// `printDate` / `printSerials` live in ./formUtils — this file exports only
// components, so Fast Refresh keeps working on it.

const text = (value: unknown): string =>
  value === null || value === undefined || value === '' ? '' : String(value);

// ── Header ─────────────────────────────────────────────────────────────────
export function PrintDocumentHeader({ docLabel, docNumber }: {
  docLabel: string;
  docNumber?: string;
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 24,
      marginBottom: 24,
      paddingBottom: 16,
      borderBottom: `1px solid ${LINE}`,
    }}>
      <div>
        <img src="/smartlife.png" alt="Smart Life" style={{ height: 48, marginBottom: 8, display: 'block' }} />
        <div style={{
          fontWeight: 700, fontSize: 13, color: INK,
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          Smart Life Contracting Company
        </div>
        <div style={{ ...labelStyle, marginTop: 2 }}>
          Warehouse &amp; Inventory Management
        </div>
      </div>

      <div className="print-doc-tint" style={{
        background: '#f0f0f8',
        border: '1px solid #e0e0ef',
        borderRadius: 8,
        padding: '12px 20px',
        textAlign: 'right',
        minWidth: 180,
      }}>
        <div style={{ ...labelStyle, letterSpacing: '0.1em', marginBottom: 4 }}>{docLabel}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: INK, letterSpacing: '-0.5px' }}>
          {docNumber || '—'}
        </div>
      </div>
    </div>
  );
}

// ── Title bar ──────────────────────────────────────────────────────────────
export function PrintDocumentTitle({ title }: { title: string }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="print-doc-ink" style={{
        background: INK,
        color: '#fff',
        textAlign: 'center',
        padding: '14px 20px',
        fontWeight: 700,
        fontSize: 16,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        borderRadius: '6px 6px 0 0',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', height: 6, borderRadius: '0 0 6px 6px', overflow: 'hidden' }}>
        <div className="print-doc-ink" style={{ flex: 1, background: '#6b2fd9' }} />
        <div className="print-doc-ink" style={{ flex: 1, background: '#00c2ff' }} />
      </div>
    </div>
  );
}

// ── Fields grid ────────────────────────────────────────────────────────────
export function PrintFieldsGrid({ fields, title }: { fields: PrintField[]; title?: string }) {
  if (!fields.length) return null;

  // Padded out to a whole number of rows so the cell borders form a clean
  // rectangle rather than trailing off mid-row.
  const padded: PrintField[] = [...fields];
  while (padded.length % FIELD_COLUMNS !== 0) padded.push({ label: '' });
  const rowCount = padded.length / FIELD_COLUMNS;

  return (
    <div style={{ marginBottom: 16 }}>
      {title && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: INK,
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
        }}>
          {title}
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${FIELD_COLUMNS}, 1fr)`,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {padded.map((field, index) => (
          <div
            key={`${field.label}-${index}`}
            style={{
              padding: '12px 16px',
              borderRight: index % FIELD_COLUMNS !== FIELD_COLUMNS - 1 ? `1px solid ${LINE}` : undefined,
              borderBottom: Math.floor(index / FIELD_COLUMNS) < rowCount - 1 ? `1px solid ${LINE}` : undefined,
            }}
          >
            {field.label && (
              <>
                <div style={{ ...labelStyle, marginBottom: 4 }}>{field.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>
                  {text(field.value) || '—'}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Free-text box ──────────────────────────────────────────────────────────
export function PrintNotesBox({ label, value, minHeight = 40 }: PrintBox) {
  return (
    <div style={{
      border: `1px solid ${LINE}`,
      borderRadius: 8,
      padding: '12px 16px',
      marginBottom: 16,
    }}>
      <div style={{ ...labelStyle, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 13, color: INK, minHeight, whiteSpace: 'pre-wrap' }}>
        {value || ''}
      </div>
    </div>
  );
}

// ── Items table ────────────────────────────────────────────────────────────
export function PrintItemsTable({ columns, rows, totalKey, totalLabel }: {
  columns: PrintColumn[];
  rows: Record<string, unknown>[];
  totalKey?: string;
  totalLabel?: string;
}) {
  const totalIndex = totalKey ? columns.findIndex(c => c.key === totalKey) : -1;
  const total = totalKey
    ? rows.reduce((sum, row) => sum + (Number(row[totalKey]) || 0), 0)
    : 0;
  const trailing = columns.length - totalIndex - 1;

  const cell = (column: PrintColumn, row: Record<string, unknown>) =>
    (column.render ? column.render(row) : text(row[column.key])) || '—';

  const headStyle: CSSProperties = {
    padding: '10px 12px', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap',
  };

  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 700, color: INK,
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
      }}>
        Stock Items
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr className="print-doc-ink" style={{ background: INK, color: '#fff' }}>
            <th style={{ ...headStyle, textAlign: 'left', width: 30 }}>#</th>
            {columns.map(column => (
              <th
                key={column.key}
                style={{
                  ...headStyle,
                  textAlign: column.align ?? 'left',
                  width: column.width,
                }}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className={index % 2 === 1 ? 'print-doc-zebra' : undefined}
              style={{
                borderBottom: '1px solid #f0f0f0',
                background: index % 2 === 0 ? '#fff' : '#fafafa',
              }}
            >
              <td style={{ padding: '10px 12px', color: MUTED }}>{index + 1}</td>
              {columns.map(column => (
                <td
                  key={column.key}
                  style={{
                    padding: '10px 12px',
                    textAlign: column.align ?? 'left',
                    fontWeight: column.strong ? 700 : undefined,
                    color: column.strong ? INK : '#4a4a6a',
                    fontSize: column.key === 'serialNumbers' || column.key === 'serialNumber' ? 12 : undefined,
                  }}
                >
                  {cell(column, row)}
                </td>
              ))}
            </tr>
          ))}

          {!rows.length && (
            <tr>
              <td
                colSpan={columns.length + 1}
                style={{ padding: '18px 12px', textAlign: 'center', color: MUTED }}
              >
                No items recorded
              </td>
            </tr>
          )}

          {totalIndex >= 0 && (
            <tr className="print-doc-tint" style={{ background: '#f5f5ff', borderTop: '2px solid #e0e0ef' }}>
              <td colSpan={totalIndex + 1} style={{
                padding: '10px 12px', fontWeight: 700, textAlign: 'right',
                textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 12, color: INK,
              }}>
                {totalLabel ?? 'Total'}
              </td>
              <td style={{
                padding: '10px 12px', textAlign: 'center',
                fontWeight: 800, fontSize: 16, color: INK,
              }}>
                {total}
              </td>
              {trailing > 0 && <td colSpan={trailing} />}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Signatures ─────────────────────────────────────────────────────────────
export function PrintSignatures({ labels }: { labels: string[] }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${labels.length}, 1fr)`,
      gap: 20,
      marginTop: 40,
    }}>
      {labels.map(label => (
        <div key={label}>
          <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 8 }} />
          <div style={{ fontWeight: 600, fontSize: 12, color: INK }}>{label}</div>
          <div style={{ fontSize: 11, color: MUTED, fontStyle: 'italic' }}>Signature &amp; Date</div>
        </div>
      ))}
    </div>
  );
}

// ── Whole document ─────────────────────────────────────────────────────────
export default function PrintDocument({
  docLabel, docNumber, title, fieldGroups, fields, purpose, notes,
  columns, rows, totalKey, totalLabel, signatures, preview,
}: PrintDocumentProps): ReactNode {
  // The editor keeps a run of blank rows to type into; none of them belong on
  // the paper record.
  const filled = rows.filter(row =>
    text(row.itemCode).trim() || text(row.itemDescription).trim());

  return (
    <div className={`print-document${preview ? ' is-preview' : ''}`}>
      <PrintDocumentHeader docLabel={docLabel} docNumber={docNumber} />
      <PrintDocumentTitle title={title} />

      {fields && <PrintFieldsGrid fields={fields} />}
      {fieldGroups?.map(group => (
        <PrintFieldsGrid key={group.title} title={group.title} fields={group.fields} />
      ))}

      {purpose && <PrintNotesBox {...purpose} />}

      <PrintItemsTable
        columns={columns}
        rows={filled}
        totalKey={totalKey}
        totalLabel={totalLabel}
      />

      {notes && (
        <div style={{ marginTop: 16 }}>
          <PrintNotesBox minHeight={80} {...notes} />
        </div>
      )}

      <PrintSignatures labels={signatures} />
    </div>
  );
}
