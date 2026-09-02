import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Calendar, ClipboardList, Download, FileDown, Filter, Search } from 'lucide-react';
import { format } from 'date-fns';
import {
  useAssignmentForms, useRtnList, useMicList, useTransferForms, useInventory,
} from '../hooks/useApi';
import MultiSelect from '../components/MultiSelect';
import SerialNumbers from '../components/SerialNumbers';
import { drawReportChrome, drawStatBoxes, drawReportFooter } from '../components/documents/reportPdf';

interface AsnLine {
  itemCode?: string; itemDescription?: string; unit?: string;
  serialNumber?: string; qtyIssued?: number; itemId?: string;
}

interface AsnForm {
  id: string; assignmentNo: string; status: string;
  date?: string; createdAt?: string; updatedAt?: string;
  projectSite?: string;
  items?: AsnLine[];
}

interface MicLine { itemCode?: string; qtyInstalled?: number; itemId?: string }
interface MicForm { id: string; status: string; items?: MicLine[] }

interface RtnLine { itemCode?: string; qtyReturned?: number; itemId?: string }
interface RtnForm { id: string; status: string; items?: RtnLine[] }

interface TrfLine { itemCode?: string; qtyToTransfer?: number; itemId?: string }
interface TrfForm { id: string; status: string; items?: TrfLine[] }

interface InvItem {
  id: string; name: string; sku: string;
  schemeNo?: string; category?: string; serialNumber?: string;
  condition?: string;
}

/** One inventory item, rolled up across every issued ASN that ever named it. */
interface IssuedRow {
  key: string;
  itemCode: string;
  itemDescription: string;
  unit: string;
  /** The warehouse's own grading of the stock, lowercased so the filter never misses on casing. */
  condition: string;
  schemeNo: string;
  category: string;
  serialNumber: string;
  /** Handed out on issued ASN forms inside the selected date range. */
  assigned: number;
  /** Fitted on approved MIC forms — stock that went out and stayed out. */
  installed: number;
  /** Brought back on approved RTN documents. */
  returned: number;
  /** Moved between holders or sites on completed TRF documents. */
  transferred: number;
  /**
   * What is still out with a holder: assigned less installed less returned.
   *
   * Transferred is deliberately not subtracted — a transfer hands the stock to
   * someone else rather than ending its life outside the warehouse, so it is
   * still out. Floored at zero: an ad-hoc return adjusts inventory without ever
   * being written back to the ASN that issued it, so a hand-out given back that
   * way can be netted off twice.
   */
  closing: number;
  /** Which ASN forms it went out on, in the order they were read. */
  assignmentNos: string[];
}

const ITEM_CONDITIONS = ['new', 'good', 'fair', 'poor'];

const CONDITION_BADGE: Record<string, string> = {
  new: 'green', good: 'blue', fair: 'yellow', poor: 'red',
};
const CONDITION_COLOR: Record<string, string> = {
  new: '#10b981', good: '#3b82f6', fair: '#f59e0b', poor: '#ef4444',
};

const conditionColor = (c: string) => CONDITION_COLOR[c] ?? '#6b7280';
const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const skuKey = (value?: string) => (value || '').trim().toLowerCase();

/**
 * `date` is a DATE column, so it arrives as a bare 'YYYY-MM-DD'. `new Date()`
 * would read that as UTC midnight and shift it a day in negative offsets, so
 * anchor it to local midnight instead. Full timestamps pass through.
 */
function parseDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
}

/**
 * What became of the stock after it was handed out.
 *
 * One row per inventory item rather than per ASN line: an item issued on four
 * forms is one thing the warehouse is owed back, and four rows of the same SKU
 * cannot be reconciled against the one MIC that fitted it or the one RTN that
 * returned it. The hand-outs are aggregated and the three documents that answer
 * "and then?" — MIC, RTN, TRF — are folded onto the same row.
 *
 * Everything is read off the documents. The assignments table is deliberately
 * not consulted: it is filled by `issueItems()` as a side effect of issuing,
 * which skips lines carrying no `itemId` and runs outside a transaction, so a
 * form can be issued without opening any assignment. The documents are the
 * record of the hand-out, and they are complete.
 */
export default function AssignedUsedReport() {
  const { data: formsData = [], isLoading } = useAssignmentForms();
  const { data: rtnData = [] } = useRtnList();
  const { data: micData = [] } = useMicList();
  const { data: transferFormsData = [] } = useTransferForms();
  const { data: inventoryData = [] } = useInventory();

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [schemeFilters, setSchemeFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [conditionFilters, setConditionFilters] = useState<string[]>([]);
  const [installedOnly, setInstalledOnly] = useState(false);
  const [returnedOnly, setReturnedOnly] = useState(false);
  const [transferredOnly, setTransferredOnly] = useState(false);

  const allRows = useMemo((): IssuedRow[] => {
    // The range narrows the hand-outs, not what became of them: a form issued
    // in June is in scope with everything its stock has done since, including
    // an installation or a return booked in August. Narrowing those too would
    // report items as still out purely because the paperwork closing them fell
    // outside the window. A form carrying no date at all stays in scope rather
    // than dropping out of every range.
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    const forms = (formsData as AsnForm[]).filter(form => {
      if (form.status !== 'issued') return false;
      if (!from && !to) return true;
      const stamp = form.date || form.updatedAt || form.createdAt;
      if (!stamp) return true;
      const issuedAt = parseDate(stamp);
      if (from && issuedAt < from) return false;
      if (to && issuedAt > to) return false;
      return true;
    });
    const inventory = inventoryData as InvItem[];

    const invById = new Map(inventory.map(item => [item.id, item] as const));
    // Only SKUs sitting on exactly one inventory row can absorb a line that
    // names no row id — on a duplicated SKU there is no telling which of them
    // the line came off, and guessing would roll two items into one.
    const invBySku = new Map<string, InvItem | null>();
    for (const item of inventory) {
      const sku = skuKey(item.sku);
      if (!sku) continue;
      invBySku.set(sku, invBySku.has(sku) ? null : item);
    }

    const rows = new Map<string, IssuedRow>();
    // How a later document's line finds the row an ASN line opened. A line
    // normally names its inventory row outright, so `byItemId` is the reliable
    // path; `bySku` is the fallback for lines that only ever carried a code.
    const byItemId = new Map<string, string>();
    const bySku = new Map<string, Set<string>>();

    const index = (row: IssuedRow, ...itemIds: (string | undefined)[]) => {
      for (const itemId of itemIds) {
        if (itemId && !byItemId.has(itemId)) byItemId.set(itemId, row.key);
      }
      const sku = skuKey(row.itemCode);
      if (!sku) return;
      const keys = bySku.get(sku) ?? new Set<string>();
      keys.add(row.key);
      bySku.set(sku, keys);
    };

    for (const form of forms) {
      for (const line of form.items ?? []) {
        const code = line.itemCode?.trim();
        const qty = line.qtyIssued ?? 0;
        if (!code || qty <= 0) continue;

        const invItem = (line.itemId ? invById.get(line.itemId) : undefined)
          ?? invBySku.get(skuKey(code))
          ?? undefined;

        // Keyed by the inventory row the line landed on, so a line that names
        // the row and one that only carries its code aggregate together rather
        // than splitting the item across two rows. Only a code that resolves to
        // no single row falls back to keying by the code itself.
        const key = line.itemId || invItem?.id || `sku:${skuKey(code)}`;

        let row = rows.get(key);
        if (!row) {
          row = {
            key,
            itemCode: code,
            itemDescription: line.itemDescription || invItem?.name || '',
            // Unit lives on the document line only — the inventory row has no
            // such column, so a line that omitted it has nothing to fall back on.
            unit: line.unit || '',
            condition: (invItem?.condition || '').toLowerCase(),
            schemeNo: invItem?.schemeNo || form.projectSite || '',
            category: invItem?.category || '',
            serialNumber: line.serialNumber || invItem?.serialNumber || '',
            assigned: 0,
            installed: 0,
            returned: 0,
            transferred: 0,
            closing: 0,
            assignmentNos: [],
          };
          rows.set(key, row);
          index(row, line.itemId, invItem?.id);
        }

        row.assigned += qty;
        if (!row.assignmentNos.includes(form.assignmentNo)) {
          row.assignmentNos.push(form.assignmentNo);
        }
      }
    }

    /**
     * Which row a MIC / RTN / TRF line belongs to.
     *
     * A code sitting on more than one row cannot absorb an unlinked line —
     * there is no telling which of them it came off, and crediting each would
     * report the same installation or return several times over. Those rows
     * show only what their linked lines prove.
     */
    const resolve = (line: { itemId?: string; itemCode?: string }) => {
      if (line.itemId) {
        const byId = byItemId.get(line.itemId);
        if (byId) return rows.get(byId);
      }
      const keys = bySku.get(skuKey(line.itemCode));
      if (keys?.size === 1) return rows.get([...keys][0]);
      return undefined;
    };

    // Fitted on site. Only approved MICs: a pending confirmation is a claim.
    for (const mic of (micData as MicForm[]).filter(m => m.status === 'approved')) {
      for (const line of mic.items ?? []) {
        const qty = line.qtyInstalled ?? 0;
        if (!line.itemCode?.trim() || qty <= 0) continue;
        const row = resolve(line);
        if (row) row.installed += qty;
      }
    }

    // Brought back. Only approved returns: a draft or a return awaiting a
    // manager is stock the worker still holds.
    for (const rtn of (rtnData as RtnForm[]).filter(r => r.status === 'approved')) {
      for (const line of rtn.items ?? []) {
        const qty = line.qtyReturned ?? 0;
        if (!line.itemCode?.trim() || qty <= 0) continue;
        const row = resolve(line);
        if (row) row.returned += qty;
      }
    }

    // Moved on. Only completed transfers: nothing has moved until then.
    for (const trf of (transferFormsData as TrfForm[]).filter(t => t.status === 'completed')) {
      for (const line of trf.items ?? []) {
        const qty = line.qtyToTransfer ?? 0;
        if (!line.itemCode?.trim() || qty <= 0) continue;
        const row = resolve(line);
        if (row) row.transferred += qty;
      }
    }

    return [...rows.values()].map(row => ({
      ...row,
      closing: Math.max(0, row.assigned - row.installed - row.returned),
    }));
  }, [formsData, inventoryData, micData, rtnData, transferFormsData, dateFrom, dateTo]);

  const schemeOptions = useMemo(
    () => [...new Set(allRows.map(r => r.schemeNo).filter(Boolean))].sort(),
    [allRows],
  );
  const categoryOptions = useMemo(
    () => [...new Set(allRows.map(r => r.category).filter(Boolean))].sort(),
    [allRows],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(row => {
      const haystack = [
        row.itemCode, row.itemDescription, row.serialNumber, row.schemeNo,
        ...row.assignmentNos,
      ].join(' ').toLowerCase();

      if (q && !haystack.includes(q)) return false;
      // No selection means "every scheme", not "no scheme".
      if (schemeFilters.length && !schemeFilters.includes(row.schemeNo)) return false;
      if (categoryFilters.length && !categoryFilters.includes(row.category)) return false;
      if (conditionFilters.length && !conditionFilters.includes(row.condition)) return false;
      if (installedOnly && row.installed <= 0) return false;
      if (returnedOnly && row.returned <= 0) return false;
      if (transferredOnly && row.transferred <= 0) return false;
      return true;
    });
  }, [allRows, search, schemeFilters, categoryFilters, conditionFilters,
    installedOnly, returnedOnly, transferredOnly]);

  /**
   * Which of the three follow-up columns to show.
   *
   * Narrowing to one document is a way of asking about that document, so the
   * other two columns are noise on the answer. With nothing narrowed all three
   * are on show; with more than one narrowed each one asked for stays, rather
   * than the three cancelling each other out and leaving the table with no
   * follow-up columns at all.
   */
  const visibleColumns = useMemo(() => {
    const narrowed = installedOnly || returnedOnly || transferredOnly;
    return {
      installed: !narrowed || installedOnly,
      returned: !narrowed || returnedOnly,
      transferred: !narrowed || transferredOnly,
    };
  }, [installedOnly, returnedOnly, transferredOnly]);

  const totals = useMemo(() => ({
    assigned: rows.reduce((sum, r) => sum + r.assigned, 0),
    installed: rows.reduce((sum, r) => sum + r.installed, 0),
    returned: rows.reduce((sum, r) => sum + r.returned, 0),
    transferred: rows.reduce((sum, r) => sum + r.transferred, 0),
    closing: rows.reduce((sum, r) => sum + r.closing, 0),
    forms: new Set(rows.flatMap(r => r.assignmentNos)).size,
  }), [rows]);

  const clearFilters = () => {
    setSearch(''); setDateFrom(''); setDateTo('');
    setSchemeFilters([]); setCategoryFilters([]); setConditionFilters([]);
    setInstalledOnly(false); setReturnedOnly(false); setTransferredOnly(false);
  };
  const hasFilters = !!search || !!dateFrom || !!dateTo
    || schemeFilters.length > 0 || categoryFilters.length > 0
    || conditionFilters.length > 0 || installedOnly || returnedOnly || transferredOnly;

  /** The sheet carries whatever the table is showing, in the same order. */
  const exportExcel = () => {
    const sheet = rows.map((row, index) => {
      const record: Record<string, string | number> = {
        '#': index + 1,
        'Item Code': row.itemCode,
        'Description': row.itemDescription,
        'Unit': row.unit,
        'Condition': titleCase(row.condition),
        'Scheme': row.schemeNo,
        'Serial No.': row.serialNumber,
        'Assigned': row.assigned,
      };
      if (visibleColumns.installed) record['Installed (MIC)'] = row.installed;
      if (visibleColumns.returned) record['Returned (RTN)'] = row.returned;
      if (visibleColumns.transferred) record['Transferred (TRF)'] = row.transferred;
      record['Still Out'] = row.closing;
      record['ASN Forms'] = row.assignmentNos.join(', ');
      return record;
    });

    const worksheet = XLSX.utils.json_to_sheet(sheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Issued Items');
    XLSX.writeFile(workbook, `issued-items-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  /**
   * The PDF record, on the same stationery as the stock movement export — the
   * two sit one tab apart, and a header that drifted would read as a different
   * document. Rows are `rows`, so the export is exactly what the table shows.
   */
  const exportPdf = async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const chrome = await drawReportChrome(doc, {
      title: 'ISSUED ITEMS REPORT (ASN)',
      meta: [
        { label: 'ITEMS', value: rows.length.toLocaleString() },
        { label: 'ASN FORMS', value: totals.forms.toLocaleString() },
      ],
    });
    const { marginL, marginR } = chrome;

    const statsEndY = drawStatBoxes(doc, chrome, chrome.contentY + 2.5, [
      { label: 'ASSIGNED', value: totals.assigned.toLocaleString(), color: [107, 47, 217] },
      ...(visibleColumns.installed
        ? [{ label: 'INSTALLED (MIC)', value: totals.installed.toLocaleString(), color: [0, 150, 80] as [number, number, number] }]
        : []),
      ...(visibleColumns.returned
        ? [{ label: 'RETURNED (RTN)', value: totals.returned.toLocaleString(), color: [0, 136, 204] as [number, number, number] }]
        : []),
      ...(visibleColumns.transferred
        ? [{ label: 'TRANSFERRED (TRF)', value: totals.transferred.toLocaleString(), color: [0, 150, 190] as [number, number, number] }]
        : []),
      { label: 'STILL OUT', value: totals.closing.toLocaleString(), color: [26, 26, 62] },
    ]);

    const tableLabelY = statsEndY + 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 26, 62);
    doc.text('ISSUED ITEMS', marginL, tableLabelY);

    /**
     * The three follow-up columns, in table order, each carrying its own head,
     * cell, total and ink — so the table is assembled from whichever of them
     * survived `visibleColumns` rather than described three times over.
     */
    const followUp = [
      {
        show: visibleColumns.installed,
        head: 'Installed',
        cell: (row: IssuedRow) => row.installed,
        total: totals.installed,
        color: [0, 150, 80] as [number, number, number],
      },
      {
        show: visibleColumns.returned,
        head: 'Returned',
        cell: (row: IssuedRow) => row.returned,
        total: totals.returned,
        color: [0, 136, 204] as [number, number, number],
      },
      {
        show: visibleColumns.transferred,
        head: 'Transferred',
        cell: (row: IssuedRow) => row.transferred,
        total: totals.transferred,
        color: [0, 150, 190] as [number, number, number],
      },
    ].filter(column => column.show);

    // Widths sum to contentW (269mm), so the table spans the same band as the
    // title bar and the stats row. Everything but Description is fixed, and
    // Description takes whatever the hidden columns gave back — it is the one
    // column with something to do with the space.
    const fixedW = 8 + 31 + 14 + 18 + 32 + 20 + 18;   // # code unit cond scheme assigned still-out
    const descW = chrome.contentW - fixedW - followUp.length * 20;

    autoTable(doc, {
      startY: tableLabelY + 3,
      head: [['#', 'Item Code', 'Description', 'Unit', 'Condition', 'Scheme',
        'Assigned', ...followUp.map(c => c.head), 'Still Out']],
      body: [
        ...rows.map((row, index) => [
          index + 1,
          row.itemCode,
          row.itemDescription || '—',
          row.unit || '—',
          titleCase(row.condition) || '—',
          row.schemeNo || '—',
          row.assigned > 0 ? String(row.assigned) : '—',
          // No arrow glyph on the transferred figure here, unlike on screen:
          // jsPDF's built-in helvetica is WinAnsi, which has no U+2194, and an
          // unmapped code point prints as a stray character rather than nothing.
          ...followUp.map(c => (c.cell(row) > 0 ? String(c.cell(row)) : '—')),
          row.closing,
        ]),
        ['', `TOTAL (${rows.length} items)`, '', '', '', '',
          totals.assigned, ...followUp.map(c => c.total), totals.closing],
      ],
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: {
        fillColor: [26, 26, 62],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.5,
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 31, font: 'courier', fontSize: 7 },
        2: { cellWidth: descW },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 32 },
        6: { cellWidth: 20, halign: 'center', textColor: [107, 47, 217] },
        // The follow-up columns start at 7 and run as far as they were kept;
        // Still Out closes the row whichever index that lands on.
        ...Object.fromEntries(followUp.map((column, i) => [
          7 + i, { cellWidth: 20, halign: 'center', textColor: column.color },
        ])),
        [7 + followUp.length]: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      },
      alternateRowStyles: { fillColor: [248, 248, 252] },
      didParseCell: (data) => {
        // Style the totals row. Section-guarded: with no rows at all it sits at
        // body index 0, which would otherwise repaint the header too.
        if (data.section === 'body' && data.row.index === rows.length) {
          data.cell.styles.fillColor = [240, 240, 248];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 8.5;
          data.cell.styles.textColor = [26, 26, 62];
        }
      },
      didDrawPage: (data) => drawReportFooter(doc, chrome, data.pageNumber),
      margin: { top: 50, left: marginL, right: marginR, bottom: 12 },
    });

    const notes = [
      'Still Out = Assigned − Installed − Returned. Transferred is not subtracted: a transfer hands the stock to another holder rather than ending its life outside the warehouse.',
      'Every figure is derived from documents: issued ASN forms, approved MIC and RTN documents, completed TRF documents. A date range narrows the hand-outs, not what became of them.',
    ];
    const filterParts = [];
    if (dateFrom || dateTo) filterParts.push(`Issued: ${dateFrom || 'All'} → ${dateTo || 'Today'}`);
    if (schemeFilters.length > 0) filterParts.push(`Schemes: ${schemeFilters.join(', ')}`);
    if (categoryFilters.length > 0) filterParts.push(`Categories: ${categoryFilters.join(', ')}`);
    if (conditionFilters.length > 0) filterParts.push(`Condition: ${conditionFilters.map(titleCase).join(', ')}`);
    if (installedOnly) filterParts.push('Installed only');
    if (returnedOnly) filterParts.push('Returned only');
    if (transferredOnly) filterParts.push('Transferred only');
    if (search) filterParts.push(`Search: "${search}"`);
    if (filterParts.length > 0) notes.push(`Filters applied: ${filterParts.join(' · ')}`);

    // autoTable stamps this on the doc but does not augment jsPDF's types.
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    notes.forEach((note, index) => doc.text(note, marginL, finalY + index * 4));

    doc.save(`issued-items-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  /** One filter chip. Active paints the swatch solid; idle keeps it as the outline. */
  const filterChip = (label: string, color: string, active: boolean, onToggle: () => void) => (
    <button
      key={label}
      onClick={onToggle}
      style={{
        padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        borderRadius: 999, border: `1px solid ${active ? color : 'var(--border)'}`,
        background: active ? color : 'transparent',
        color: active ? '#fff' : color,
      }}
    >
      {label}
    </button>
  );

  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
    </label>
  );

  const statCard = (label: string, value: number, color: string, bg: string) => (
    <div style={{ flex: 1, background: bg, border: `1px solid ${color}33`, borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value.toLocaleString()}</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <p className="text-muted text-sm">
          {rows.length} item{rows.length === 1 ? '' : 's'}
          {' · '}{totals.assigned} assigned on {totals.forms} form{totals.forms === 1 ? '' : 's'}
        </p>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={exportExcel} disabled={rows.length === 0}>
            <Download size={14} /> Excel
          </button>
          <button className="btn btn-ghost" onClick={() => exportPdf()} disabled={rows.length === 0}>
            <FileDown size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Summary Cards. Assigned and Still Out are the two ends of every row and
          always stand; the three in between come and go with their columns. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {statCard('Assigned', totals.assigned, 'var(--purple)', 'var(--purple-dim)')}
        {visibleColumns.installed && statCard('Installed (MIC)', totals.installed, 'var(--green)', 'var(--green-dim)')}
        {visibleColumns.returned && statCard('Returned (RTN)', totals.returned, 'var(--accent)', 'var(--accent-dim)')}
        {visibleColumns.transferred && statCard('Transferred (TRF)', totals.transferred, 'var(--blue)', 'var(--blue-dim)')}
        {statCard('Still Out', totals.closing, 'var(--yellow)', 'var(--yellow-dim)')}
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div className="search-bar">
            <Search size={14} />
            <input
              placeholder="Search item code, description, serial, scheme, ASN no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <MultiSelect
            options={schemeOptions}
            selected={schemeFilters}
            onChange={setSchemeFilters}
            placeholder="All Schemes"
          />
          <MultiSelect
            options={categoryOptions}
            selected={categoryFilters}
            onChange={setCategoryFilters}
            placeholder="All Categories"
          />
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <Filter size={13} /> Clear
            </button>
          )}
        </div>

        {/* When the stock went out. Left empty by default: the tab's own
            question is what is still owed back, which has no natural period. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 84 }}>
            Issued
          </span>
          <div style={{ position: 'relative' }}>
            <Calendar size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              type="date"
              className="form-input"
              style={{ width: 165, paddingLeft: 28 }}
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              max={dateTo || undefined}
            />
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>to</span>
          <div style={{ position: 'relative' }}>
            <Calendar size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              type="date"
              className="form-input"
              style={{ width: 165, paddingLeft: 28 }}
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              min={dateFrom || undefined}
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setDateFrom(''); setDateTo(''); }}
            >
              Clear dates
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 84 }}>
            Condition
          </span>
          {ITEM_CONDITIONS.map(cond => filterChip(
            titleCase(cond),
            conditionColor(cond),
            conditionFilters.includes(cond),
            () => setConditionFilters(prev => prev.includes(cond) ? prev.filter(c => c !== cond) : [...prev, cond]),
          ))}
        </div>

        {/* The three "and then?" documents, each as its own narrowing. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18, marginTop: 12 }}>
          {toggle('Installed items only', installedOnly, setInstalledOnly)}
          {toggle('Returned items only', returnedOnly, setReturnedOnly)}
          {toggle('Transferred items only', transferredOnly, setTransferredOnly)}
        </div>

        {hasFilters && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
            Showing <strong style={{ color: 'var(--text)' }}>{rows.length}</strong> of {allRows.length} items
            {schemeFilters.length > 0 && ` · Schemes: ${schemeFilters.join(', ')}`}
            {categoryFilters.length > 0 && ` · Categories: ${categoryFilters.join(', ')}`}
            {conditionFilters.length > 0 && ` · Condition: ${conditionFilters.map(titleCase).join(', ')}`}
            {(dateFrom || dateTo) && ` · Issued: ${dateFrom || 'All'} → ${dateTo || 'today'}`}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="empty-state"><span>Loading…</span></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={48} style={{ color: 'var(--text-3)' }} />
          <span>No issued items match these filters</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>#</th>
                <th>Item Code</th>
                <th>Description</th>
                <th>Unit</th>
                <th>Condition</th>
                <th>Scheme</th>
                <th>Serial No.</th>
                <th style={{ textAlign: 'center', color: 'var(--purple)' }}>Assigned</th>
                {visibleColumns.installed && (
                  <th style={{ textAlign: 'center', color: 'var(--green)' }}>Installed</th>
                )}
                {visibleColumns.returned && (
                  <th style={{ textAlign: 'center', color: 'var(--accent)' }}>Returned</th>
                )}
                {visibleColumns.transferred && (
                  <th style={{ textAlign: 'center', color: 'var(--blue)' }}>Transferred</th>
                )}
                <th style={{ textAlign: 'center', color: 'var(--yellow)' }}>Still Out</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key}>
                  <td style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>{index + 1}</td>
                  <td>
                    <code style={{ fontSize: 11, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--accent)' }}>
                      {row.itemCode}
                    </code>
                    {row.assignmentNos.length > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                        {row.assignmentNos.join(', ')}
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: 500 }}>{row.itemDescription || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.unit || '—'}</td>
                  <td>
                    {row.condition
                      ? <span className={`badge badge-${CONDITION_BADGE[row.condition] || 'blue'}`}>{row.condition}</span>
                      : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.schemeNo || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    <SerialNumbers value={row.serialNumber} />
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: row.assigned > 0 ? 'var(--purple)' : 'var(--text-3)' }}>
                    {row.assigned > 0 ? row.assigned : '—'}
                  </td>
                  {visibleColumns.installed && (
                    <td style={{ textAlign: 'center', fontWeight: 700, color: row.installed > 0 ? 'var(--green)' : 'var(--text-3)' }}>
                      {row.installed > 0 ? row.installed : '—'}
                    </td>
                  )}
                  {visibleColumns.returned && (
                    <td style={{ textAlign: 'center', fontWeight: 700, color: row.returned > 0 ? 'var(--accent)' : 'var(--text-3)' }}>
                      {row.returned > 0 ? `↩ ${row.returned}` : '—'}
                    </td>
                  )}
                  {visibleColumns.transferred && (
                    <td style={{ textAlign: 'center', fontWeight: row.transferred > 0 ? 700 : 400, color: row.transferred > 0 ? 'var(--blue)' : 'var(--text-3)' }}>
                      {row.transferred > 0 ? `↔ ${row.transferred}` : '—'}
                    </td>
                  )}
                  <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: row.closing > 0 ? 'var(--yellow)' : 'var(--green)' }}>
                    {row.closing}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-3)', fontWeight: 700, fontSize: 13 }}>
                <td colSpan={7} style={{ padding: '10px 16px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>
                  Total ({rows.length} items)
                </td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--purple)' }}>{totals.assigned}</td>
                {visibleColumns.installed && (
                  <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--green)' }}>{totals.installed}</td>
                )}
                {visibleColumns.returned && (
                  <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--accent)' }}>{totals.returned}</td>
                )}
                {visibleColumns.transferred && (
                  <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--blue)' }}>
                    {totals.transferred > 0 ? `↔ ${totals.transferred}` : '—'}
                  </td>
                )}
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--yellow)', fontSize: 16 }}>{totals.closing}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
        <strong style={{ color: 'var(--text-2)' }}>How it works:</strong>
        {' '}One row per item, rolled up across every issued Assignment Form that named it. Assigned = handed out on issued ASN forms · Installed = fitted on approved MIC forms · Returned = brought back on approved RTN documents · Transferred = moved to another holder or site on completed TRF documents · <strong style={{ color: 'var(--text-2)' }}>Still Out = Assigned − Installed − Returned</strong>. Transferred is not subtracted: a transfer hands the stock to someone else rather than ending its life outside the warehouse, so it is still out. A date range narrows the hand-outs, not what became of them: a form issued in June stays in scope along with the installation or return booked against its stock in August.
      </div>
    </div>
  );
}
