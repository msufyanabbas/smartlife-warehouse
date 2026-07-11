import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { BarChart2, Download, Search, Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { useInventory, useItemUsage, useAssignments } from '../hooks/useApi';
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
  usedAt?: string; createdAt: string;
  item?: { name: string; sku: string };
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
  issued: number;
  closing: number;
}

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
  const { data: assignments = [] } = useAssignments();

  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const list = items as InventoryItem[];
  const usage = usageData as UsageRecord[];

  const schemeOptions = useMemo(() => [...new Set(list.map(i => i.schemeNo).filter(Boolean))].sort() as string[], [list]);
  const categoryOptions = useMemo(() => [...new Set(list.map(i => i.category).filter(Boolean))].sort() as string[], [list]);

  // Build stock report rows
  const reportRows = useMemo((): StockRow[] => {
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date('2000-01-01T00:00:00');
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : new Date();

    return list
      .filter(item => {
        const q = search.toLowerCase();
        const matchSearch = !q || item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q) || item.serialNumber?.toLowerCase().includes(q) || item.schemeNo?.toLowerCase().includes(q);
        const matchScheme = !schemeFilter || item.schemeNo === schemeFilter;
        const matchCat = !categoryFilter || item.category === categoryFilter;
        return matchSearch && matchScheme && matchCat;
      })
      // Only items backed by a formal GRN document belong in the stock report.
      // Stock added directly to inventory (no GRN) is undocumented and excluded.
      .filter(item => !!item.grnId)
      .map(item => {
        // recordUsage() deducts consumption from totalQuantity, so the stored
        // total is stock as of *now*. Rewind it by re-adding usage logged after
        // each point in time we want to report on.
        const usageFor = (match: (d: Date) => boolean) => usage
          .filter(u => u.itemId === item.id && match(new Date(u.usedAt || u.createdAt)))
          .reduce((s, u) => s + u.quantityUsed, 0);

        const issuedInPeriod = usageFor(d => d >= from && d <= to);
        const issuedAfterPeriod = usageFor(d => d > to);

        // Receipt date for the GRN-backed stock: prefer the explicit receipt
        // timestamp, otherwise fall back to when the GRN-linked row was created.
        const receiptDate = item.receivedAt
          ? new Date(item.receivedAt)
          : item.grnId
            ? new Date(item.createdAt)
            : null;

        // Received in period = has GRN AND receipt date falls within period.
        const receivedInPeriod = !!(
          item.grnId &&
          receiptDate &&
          receiptDate >= from &&
          receiptDate <= to
        );

        // Opening = has GRN AND receipt date is BEFORE the period started.
        const grnBeforePeriod = !!(
          item.grnId &&
          receiptDate &&
          receiptDate < from
        );

        // Rewinding in-period and post-period usage gives the quantity the item
        // held before anything was drawn down — its receipt quantity.
        const stockBeforeIssues = item.totalQuantity + issuedInPeriod + issuedAfterPeriod;

        // Received quantity — GRN-backed stock receipted in this period.
        const received = receivedInPeriod ? stockBeforeIssues : 0;
        // Opening stock — GRN-backed stock that existed before this period.
        const opening = grnBeforePeriod ? Math.max(0, stockBeforeIssues) : 0;
        // Closing = Opening + Received − Issued.
        const closing = Math.max(0, opening + received - issuedInPeriod);
        const issued = issuedInPeriod;

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
          issued,
          closing: Math.max(0, closing),
        };
      });
  }, [list, usage, dateFrom, dateTo, search, schemeFilter, categoryFilter]);

  // Totals
  const totals = useMemo(() => ({
    opening: reportRows.reduce((s, r) => s + r.opening, 0),
    received: reportRows.reduce((s, r) => s + r.received, 0),
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
    setSearch(''); setSchemeFilter(''); setCategoryFilter('');
    // Reset dates to this month default, not empty (empty breaks date formatting)
    setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setDateTo(today);
  };
  const hasFilters = search || schemeFilter || categoryFilter;

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
          <select className="form-input" value={schemeFilter} onChange={e => setSchemeFilter(e.target.value)}>
            <option value="">All Schemes</option>
            {schemeOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-input" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <Filter size={13} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {statCard('Opening Stock', totals.opening, 'var(--text)', 'var(--bg-2)')}
        {statCard('Received', totals.received, 'var(--green)', 'var(--green-dim)')}
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
                    <td style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace' }}>
                      {row.serialNumber || '—'}
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
        {' '}Opening = stock receipted via GRN before this period · Received = stock receipted via GRN within this period · Issued = items consumed/used in this period · Closing = Opening + Received − Issued · Items with no GRN document are excluded from this report
      </div>
    </div>
  );
}