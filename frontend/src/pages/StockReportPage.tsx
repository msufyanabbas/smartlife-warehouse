import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { BarChart2, Download, Search, Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { useInventory, useItemUsage, useGrnList } from '../hooks/useApi';
import MultiSelect from '../components/MultiSelect';
import SerialNumbers from '../components/SerialNumbers';
import AssignedUsedReport from './AssignedUsedReport';

interface InventoryItem {
  id: string; name: string; sku: string; schemeNo?: string; projectName?: string;
  category?: string; serialNumber?: string;
  totalQuantity: number; availableQuantity: number; assignedQuantity: number;
  usedQuantity: number; condition: string;
  grnId?: string; grnNo?: string;
  receivedAt?: string; createdAt: string;
}

interface UsageRecord {
  id: string; itemId: string; quantityUsed: number;
  assignmentId?: string;
  usedAt?: string; createdAt: string;
  item?: { name: string; sku: string };
}

interface GrnLineItem {
  itemCode: string; itemDescription: string; receivedQty: number;
}

interface GrnDocument {
  id: string; grnNo: string; schemeNo?: string; status: string;
  dateOfReceipt?: string; createdAt: string;
  items?: GrnLineItem[];
}

interface StockRow {
  itemId: string;
  name: string;
  sku: string;
  serialNumber: string;
  schemeNo: string;
  grnNo: string;
  category: string;
  opening: number;
  received: number;
  assigned: number;
  issued: number;
  closing: number;
}

/**
 * `dateOfReceipt` is a DATE column, so it arrives as a bare 'YYYY-MM-DD' string.
 * `new Date()` would read that as UTC midnight and shift it a day in negative
 * offsets, so anchor it to local midnight instead. Full timestamps pass through.
 */
function parseDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
}

const matchKey = (sku?: string, schemeNo?: string) =>
  `${(sku || '').trim().toLowerCase()}|${(schemeNo || '').trim().toLowerCase()}`;

const QUICK_RANGES = [
  { label: 'This Month', getValue: () => ({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'Last Month', getValue: () => ({ from: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), to: format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') }) },
  { label: 'Last 3 Months', getValue: () => ({ from: format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'This Year', getValue: () => ({ from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` }) },
];

type ReportTab = 'movement' | 'assigned-used';

export default function StockReportPage() {
  const [tab, setTab] = useState<ReportTab>('movement');

  const tabButton = (value: ReportTab, label: string) => (
    <button
      className={`btn btn-sm ${tab === value ? 'btn-primary' : 'btn-ghost'}`}
      onClick={() => setTab(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h1>Reports</h1>
        <p>Stock movement and assigned / used item history</p>
      </div>

      <div className="flex gap-2" style={{ marginBottom: 20 }}>
        {tabButton('movement', 'Stock Movement')}
        {tabButton('assigned-used', 'Assigned & Used Items')}
      </div>

      {tab === 'movement' ? <StockMovementReport /> : <AssignedUsedReport />}
    </div>
  );
}

function StockMovementReport() {
  const { data: items = [] } = useInventory();
  const { data: usageData = [] } = useItemUsage();
  const { data: grnData = [] } = useGrnList();

  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');
  const [schemeFilters, setSchemeFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);

  const list = items as InventoryItem[];
  const usage = usageData as UsageRecord[];
  const grns = grnData as GrnDocument[];

  const schemeOptions = useMemo(() => [...new Set(list.map(i => i.schemeNo).filter(Boolean))].sort() as string[], [list]);
  const categoryOptions = useMemo(() => [...new Set(list.map(i => i.category).filter(Boolean))].sort() as string[], [list]);

  /**
   * Where a document line lands in inventory when it names a SKU but no row id.
   *
   * GRN id + SKU first: linkGrnToInventory() stamps the row it topped up with the
   * GRN's id, so that stamp is a definitive record of where the stock actually
   * went — it survives scheme edits and disambiguates duplicate SKUs, either of
   * which make the name-based lookups below land a receipt on the wrong row.
   * Then SKU + scheme, mirroring the backend's upsert, then SKU alone as a last
   * resort. (A row only remembers the *last* GRN that touched it, so earlier
   * receipts on the same row still need the name-based fallbacks.)
   */
  const itemLookup = useMemo(() => {
    const byGrnAndSku = new Map<string, string>();
    const byGrn = new Map<string, string[]>();
    const bySkuAndScheme = new Map<string, string>();
    const bySku = new Map<string, string>();
    const ids = new Set<string>();
    for (const item of list) {
      ids.add(item.id);
      if (item.grnId) {
        const grnSku = `${item.grnId}|${matchKey(item.sku)}`;
        if (!byGrnAndSku.has(grnSku)) byGrnAndSku.set(grnSku, item.id);
        const forGrn = byGrn.get(item.grnId) ?? [];
        forGrn.push(item.id);
        byGrn.set(item.grnId, forGrn);
      }
      const skuScheme = matchKey(item.sku, item.schemeNo);
      if (!bySkuAndScheme.has(skuScheme)) bySkuAndScheme.set(skuScheme, item.id);
      const sku = matchKey(item.sku);
      if (!bySku.has(sku)) bySku.set(sku, item.id);
    }
    return { byGrnAndSku, byGrn, bySkuAndScheme, bySku, ids };
  }, [list]);

  /**
   * How much stock each inventory row formally received via GRN inside the period.
   *
   * This has to come from the GRN documents themselves, not from the row's
   * quantity. An inventory row accumulates stock from several sources — manual
   * adds (which upsert onto an existing SKU) and any number of GRNs — but only
   * ever remembers the *last* GRN that touched it. Reading `totalQuantity` as
   * "received" therefore credits the whole row, pre-existing stock included, to
   * that one GRN.
   *
   * Each line lands on exactly one row, so a receipt is never counted twice.
   */
  const receiptsByItem = useMemo(() => {
    const { byGrnAndSku, byGrn, bySkuAndScheme, bySku } = itemLookup;
    const receipts = new Map<string, { date: Date; qty: number }[]>();
    for (const grn of grns) {
      // Drafts have not entered inventory yet.
      if (grn.status !== 'completed') continue;

      const date = parseDate(grn.dateOfReceipt || grn.createdAt);
      const lines = (grn.items ?? []).filter(l => l.itemCode?.trim() && l.receivedQty > 0);
      // Rows stamped as last topped-up by this GRN. When the GRN has a single
      // line and a single stamped row, they pair up with no SKU text needed —
      // covers rows whose SKU was edited after receipt, which every name-based
      // lookup would otherwise drop (inflating that row's Opening by the
      // orphaned receipt).
      const stamped = byGrn.get(grn.id) ?? [];

      for (const line of lines) {
        const itemId = byGrnAndSku.get(`${grn.id}|${matchKey(line.itemCode)}`)
          ?? (lines.length === 1 && stamped.length === 1 ? stamped[0] : undefined)
          ?? bySkuAndScheme.get(matchKey(line.itemCode, grn.schemeNo))
          ?? bySku.get(matchKey(line.itemCode));
        // A GRN whose stock was since deleted from inventory has no row to sit on.
        if (!itemId) continue;
        const forItem = receipts.get(itemId) ?? [];
        forItem.push({ date, qty: line.receivedQty });
        receipts.set(itemId, forItem);
      }
    }
    return receipts;
  }, [itemLookup, grns]);

  // Build stock report rows
  const reportRows = useMemo((): StockRow[] => {
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date('2000-01-01T00:00:00');
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : new Date();

    return list
      .filter(item => {
        const q = search.toLowerCase();
        const matchSearch = !q || item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q) || item.serialNumber?.toLowerCase().includes(q) || item.schemeNo?.toLowerCase().includes(q);
        // No selection means "every scheme", not "no scheme".
        const matchScheme = !schemeFilters.length || schemeFilters.includes(item.schemeNo || '');
        const matchCat = !categoryFilters.length || categoryFilters.includes(item.category || '');
        return matchSearch && matchScheme && matchCat;
      })
      .map(item => {
        // Issued — only consumption logged inside this period.
        const issuedInPeriod = usage
          .filter(u => u.itemId === item.id)
          .filter(u => {
            const d = new Date(u.usedAt || u.createdAt);
            return d >= from && d <= to;
          })
          .reduce((s, u) => s + u.quantityUsed, 0);

        // Received — only what a GRN formally receipted inside this period.
        const received = (receiptsByItem.get(item.id) ?? [])
          .filter(r => r.date >= from && r.date <= to)
          .reduce((s, r) => s + r.qty, 0);

        // Closing and Assigned come straight off the inventory row — the ground
        // truth the backend keeps live (issueItems() moves availableQuantity into
        // assignedQuantity; returns move it back). They cannot disagree with the
        // Inventory page, because they ARE the Inventory page.
        const closing = item.availableQuantity;
        const assigned = item.assignedQuantity || 0;

        // Everything ever added to this row. The backend only moves stock
        // *between* these three counters — assigning trades available for
        // assigned, consuming trades assigned for used — so their sum is
        // conserved through every hand-out, return and usage, and changes only
        // when stock enters (GRN receipt, manual add) or is manually removed.
        const everReceived = closing + assigned + (item.usedQuantity || 0);

        // Opening = stock on hand before this period's receipts arrived. Being
        // built from the conserved sum, it does not drift when workers hand
        // items back or consume them after the period.
        const opening = Math.max(0, everReceived - received);

        return {
          itemId: item.id,
          name: item.name,
          sku: item.sku,
          serialNumber: item.serialNumber || '',
          schemeNo: item.schemeNo || '',
          grnNo: item.grnNo || '',
          category: item.category || '',
          opening,
          received,
          assigned,
          issued: issuedInPeriod,
          closing,
        };
      });
  }, [list, usage, receiptsByItem, dateFrom, dateTo, search, schemeFilters, categoryFilters]);

  // Totals
  const totals = useMemo(() => ({
    opening: reportRows.reduce((s, r) => s + r.opening, 0),
    received: reportRows.reduce((s, r) => s + r.received, 0),
    assigned: reportRows.reduce((s, r) => s + r.assigned, 0),
    issued: reportRows.reduce((s, r) => s + r.issued, 0),
    closing: reportRows.reduce((s, r) => s + r.closing, 0),
  }), [reportRows]);

  const setQuickRange = (range: typeof QUICK_RANGES[0]) => {
    const { from, to } = range.getValue();
    setDateFrom(from);
    setDateTo(to);
  };

  const exportExcel = () => {
    const data = reportRows.map(r => ({
      'Product': r.name,
      'SKU': r.sku,
      'Serial No.': r.serialNumber,
      'Scheme No.': r.schemeNo,
      'GRN No.': r.grnNo,
      'Category': r.category,
      'Opening': r.opening,
      'Received': r.received,
      'Assigned': r.assigned,
      'Issued': r.issued,
      'Closing': r.closing,
    }));

    // Add totals row
    data.push({
      'Product': 'TOTAL',
      'SKU': '',
      'Serial No.': '',
      'Scheme No.': '',
      'GRN No.': '',
      'Category': '',
      'Opening': totals.opening,
      'Received': totals.received,
      'Assigned': totals.assigned,
      'Issued': totals.issued,
      'Closing': totals.closing,
    });

    const ws = XLSX.utils.json_to_sheet(data);

    // Bold the totals row
    const totalRowIdx = data.length + 1; // 1-indexed + header
    ws[`A${totalRowIdx}`] = { v: 'TOTAL', t: 's', s: { font: { bold: true } } };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Report');
    XLSX.writeFile(wb, `stock-report-${dateFrom || 'all'}-to-${dateTo || 'today'}.xlsx`);
  };

  const clearFilters = () => {
    setSearch(''); setSchemeFilters([]); setCategoryFilters([]);
    // Reset dates to this month default, not empty (empty breaks date formatting)
    setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setDateTo(today);
  };
  const hasFilters = !!search || schemeFilters.length > 0 || categoryFilters.length > 0;

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
          {dateFrom ? format(new Date(dateFrom), 'dd MMM yyyy') : 'All time'} → {dateTo ? format(new Date(dateTo), 'dd MMM yyyy') : 'today'}
          {' · '}{reportRows.length} items
        </p>
        <button className="btn btn-ghost" onClick={exportExcel}>
          <Download size={14} /> Export Excel
        </button>
      </div>

      {/* Quick range buttons */}
      <div className="flex gap-2" style={{ marginBottom: 16 }}>
        {QUICK_RANGES.map(r => (
          <button key={r.label} className="btn btn-ghost btn-sm" onClick={() => setQuickRange(r)}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Date + Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>From Date</label>
            <input type="date" className="form-input" style={{ width: 160 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={dateTo} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>To Date</label>
            <input type="date" className="form-input" style={{ width: 160 }} value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom} max={today} />
          </div>
          <div className="search-bar">
            <Search size={14} />
            <input placeholder="Search product, SKU, serial, scheme…" value={search} onChange={e => setSearch(e.target.value)} />
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

        {hasFilters && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
            Showing <strong style={{ color: 'var(--text)' }}>{reportRows.length}</strong> of {list.length} items
            {schemeFilters.length > 0 && ` · Schemes: ${schemeFilters.join(', ')}`}
            {categoryFilters.length > 0 && ` · Categories: ${categoryFilters.join(', ')}`}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {statCard('Opening Stock', totals.opening, 'var(--text)', 'var(--bg-2)')}
        {statCard('Received', totals.received, 'var(--green)', 'var(--green-dim)')}
        {statCard('Assigned', totals.assigned, 'var(--purple)', 'var(--purple-dim)')}
        {statCard('Issued / Used', totals.issued, 'var(--yellow)', 'var(--yellow-dim)')}
        {statCard('Closing Stock', totals.closing, 'var(--accent)', 'var(--accent-dim)')}
      </div>

      {/* Report Table */}
      {reportRows.length === 0 ? (
        <div className="empty-state">
          <BarChart2 size={48} style={{ color: 'var(--text-3)' }} />
          <span>No data for selected period</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Serial No.</th>
                <th>Scheme</th>
                <th>GRN No.</th>
                <th>Category</th>
                <th style={{ textAlign: 'center', background: 'var(--bg-3)' }}>Opening</th>
                <th style={{ textAlign: 'center', color: 'var(--green)' }}>Received</th>
                <th style={{ textAlign: 'center', color: 'var(--purple)' }}>Assigned</th>
                <th style={{ textAlign: 'center', color: 'var(--yellow)' }}>Issued</th>
                <th style={{ textAlign: 'center', color: 'var(--accent)' }}>Closing</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map(row => {
                const closingColor = row.closing === 0 ? 'var(--red)' : row.closing <= 3 ? 'var(--yellow)' : 'var(--green)';
                return (
                  <tr key={row.itemId}>
                    <td style={{ fontWeight: 500 }}>{row.name}</td>
                    <td>
                      <code style={{ fontSize: 11, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--accent)' }}>
                        {row.sku}
                      </code>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      <SerialNumbers value={row.serialNumber} />
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.schemeNo || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {row.grnNo
                        ? <span className="badge badge-blue">{row.grnNo}</span>
                        : <span style={{ color: 'var(--text-3)' }}>No GRN</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.category || '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.opening}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: row.received > 0 ? 'var(--green)' : 'var(--text-3)' }}>
                      {row.received > 0 ? `+${row.received}` : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: row.assigned !== 0 ? 'var(--purple)' : 'var(--text-3)' }}>
                      {row.assigned !== 0 ? row.assigned : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: row.issued > 0 ? 'var(--yellow)' : 'var(--text-3)' }}>
                      {row.issued > 0 ? `-${row.issued}` : '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: closingColor }}>
                      {row.closing}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr style={{ background: 'var(--bg-3)', fontWeight: 700, fontSize: 13 }}>
                <td colSpan={6} style={{ padding: '10px 16px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>
                  Total ({reportRows.length} items)
                </td>
                <td style={{ textAlign: 'center', padding: '10px 16px' }}>{totals.opening}</td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--green)' }}>+{totals.received}</td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--purple)' }}>{totals.assigned}</td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--yellow)' }}>-{totals.issued}</td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--accent)', fontSize: 16 }}>{totals.closing}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Legend */}
      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
        <strong style={{ color: 'var(--text-2)' }}>How it works:</strong>
        {' '}Opening = stock at start of period · Received = stock receipted via GRN in this period · Assigned = stock currently out with workers (all-time, not period-scoped) · Issued/Used = stock consumed in this period · Closing = current available stock (matches Inventory page). Stock held by workers is out of the warehouse but not yet consumed, so it reduces Closing without counting as Issued.
      </div>
    </div>
  );
}