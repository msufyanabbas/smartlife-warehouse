import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { BarChart2, Download, Search, Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { useInventory, useItemUsage, useGrnList, useAssignmentHistory, useAssignmentForms } from '../hooks/useApi';
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

interface AssignmentRecord {
  id: string; itemId: string; quantity: number; status: string;
  returnedAt?: string; createdAt: string; updatedAt: string;
}

/**
 * When an assignment stopped being held by its worker, or null if it still is.
 *
 * A full return stamps `returnedAt`. A full transfer to another worker only flips
 * the status and leaves the quantity on the row — the stock reappears on the
 * destination's assignment — so without this it would be counted under both workers.
 * There is no transfer timestamp, and `updatedAt` is the closest thing to one.
 */
function assignmentEndedAt(a: AssignmentRecord): Date | null {
  if (a.returnedAt) return new Date(a.returnedAt);
  if (a.status === 'transferred') return new Date(a.updatedAt);
  return null;
}

interface GrnLineItem {
  itemCode: string; itemDescription: string; receivedQty: number;
}

interface GrnDocument {
  id: string; grnNo: string; schemeNo?: string; status: string;
  dateOfReceipt?: string; createdAt: string;
  items?: GrnLineItem[];
}

interface AsnLineItem {
  itemCode: string; itemDescription: string; qtyIssued: number; itemId?: string;
}

interface AsnDocument {
  id: string; assignmentNo: string; status: string;
  date?: string; createdAt: string;
  items?: AsnLineItem[];
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
  const { data: assignmentData = [] } = useAssignmentHistory();
  const { data: assignmentFormData = [] } = useAssignmentForms();

  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState('');
  const [schemeFilters, setSchemeFilters] = useState<string[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);

  const list = items as InventoryItem[];
  const usage = usageData as UsageRecord[];
  const grns = grnData as GrnDocument[];
  const assignments = assignmentData as AssignmentRecord[];
  const asns = assignmentFormData as AsnDocument[];

  const schemeOptions = useMemo(() => [...new Set(list.map(i => i.schemeNo).filter(Boolean))].sort() as string[], [list]);
  const categoryOptions = useMemo(() => [...new Set(list.map(i => i.category).filter(Boolean))].sort() as string[], [list]);

  /**
   * Where a document line lands in inventory when it names a SKU but no row id.
   * SKU + scheme first, mirroring the backend's upsert, then SKU alone to catch
   * rows whose scheme was edited after the document was written.
   */
  const itemLookup = useMemo(() => {
    const bySkuAndScheme = new Map<string, string>();
    const bySku = new Map<string, string>();
    const ids = new Set<string>();
    for (const item of list) {
      ids.add(item.id);
      const skuScheme = matchKey(item.sku, item.schemeNo);
      if (!bySkuAndScheme.has(skuScheme)) bySkuAndScheme.set(skuScheme, item.id);
      const sku = matchKey(item.sku);
      if (!bySku.has(sku)) bySku.set(sku, item.id);
    }
    return { bySkuAndScheme, bySku, ids };
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
    const { bySkuAndScheme, bySku } = itemLookup;
    const receipts = new Map<string, { date: Date; qty: number }[]>();
    for (const grn of grns) {
      // Drafts have not entered inventory yet.
      if (grn.status !== 'completed') continue;

      const date = parseDate(grn.dateOfReceipt || grn.createdAt);

      for (const line of grn.items ?? []) {
        if (!line.itemCode?.trim() || line.receivedQty <= 0) continue;
        const itemId = bySkuAndScheme.get(matchKey(line.itemCode, grn.schemeNo))
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

  /**
   * How much stock each inventory row has ever been issued out to a worker, read
   * from the Assignment Form (ASN) documents rather than the `assignments` table.
   *
   * The ASN documents are the source of truth. Issuing a form is supposed to open
   * an assignment row per line, but forms issued before that was enforced left
   * none behind, so the assignments table under-reports historic hand-outs while
   * the documents themselves still carry the full record in their `items` array.
   *
   * A line normally names its inventory row outright (`itemId`); lines saved
   * before that was required, or pointing at stock since deleted, fall back to
   * matching on item code.
   *
   * Deliberately not date-scoped: this is a running total of everything ever
   * issued, not a movement inside the reporting period. Note that ASNs only
   * record stock going *out* — returns and transfers are not documents — so this
   * never decreases.
   */
  const assignedByItem = useMemo(() => {
    const { bySku, ids } = itemLookup;
    const assigned = new Map<string, number>();

    for (const asn of asns) {
      // Drafts and approved-but-unissued forms have not moved any stock yet.
      if (asn.status !== 'issued') continue;

      for (const line of asn.items ?? []) {
        const qty = line.qtyIssued ?? 0;
        if (qty <= 0) continue;
        const itemId = line.itemId && ids.has(line.itemId)
          ? line.itemId
          : bySku.get(matchKey(line.itemCode));
        if (!itemId) continue;
        assigned.set(itemId, (assigned.get(itemId) ?? 0) + qty);
      }
    }
    return assigned;
  }, [itemLookup, asns]);

  // Build stock report rows
  const reportRows = useMemo((): StockRow[] => {
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date('2000-01-01T00:00:00');
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : new Date();

    /**
     * How much of an item was out with workers at instant `when` — used to date the
     * Opening balance back to the start of the period.
     *
     * `assignedQuantity` on the item is a live snapshot with no date on it, so it
     * cannot answer this for a past period — using it would let an assignment made
     * today shrink last quarter's opening balance. The assignment rows do carry
     * dates, so reconstruct from those: an assignment counts if it had been made by
     * `when` and had not been handed back yet. Logging usage draws stock down out of
     * the assignment, so usage recorded after `when` is added back.
     *
     * This is the one figure still read from the assignments table, because it is
     * the only source with dates on it. Forms issued before assignment rows were
     * enforced are missing here, which understates what was out with workers at the
     * period start and so overstates Opening. Fixing that properly needs a dated
     * movement log; flagged, not solved.
     *
     * Caveat: a *partial* return or transfer decrements the assignment in place
     * without leaving a dated record, so it cannot be rewound either.
     */
    const assignedOutAt = (itemId: string, when: Date) => assignments
      .filter(a => a.itemId === itemId)
      .filter(a => new Date(a.createdAt) <= when)
      .filter(a => {
        const endedAt = assignmentEndedAt(a);
        return !endedAt || endedAt > when;
      })
      .reduce((sum, a) => {
        const usedSince = usage
          .filter(u => u.assignmentId === a.id && new Date(u.usedAt || u.createdAt) > when)
          .reduce((s, u) => s + u.quantityUsed, 0);
        return sum + a.quantity + usedSince;
      }, 0);

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
        // recordUsage() deducts consumption from totalQuantity, so the stored
        // total is stock as of *now*. Rewind it by re-adding usage logged after
        // each point in time we want to report on.
        const usageFor = (match: (d: Date) => boolean) => usage
          .filter(u => u.itemId === item.id && match(new Date(u.usedAt || u.createdAt)))
          .reduce((s, u) => s + u.quantityUsed, 0);

        const issuedInPeriod = usageFor(d => d >= from && d <= to);
        const issuedAfterPeriod = usageFor(d => d > to);

        const receiptsFor = (match: (d: Date) => boolean) => (receiptsByItem.get(item.id) ?? [])
          .filter(r => match(r.date))
          .reduce((s, r) => s + r.qty, 0);

        // Received — only what a GRN formally receipted inside this period.
        const received = receiptsFor(d => d >= from && d <= to);
        const receivedAfterPeriod = receiptsFor(d => d > to);

        // Stock the warehouse still *owned* at each edge of the period — with
        // workers or on the shelf, but not yet consumed. `totalQuantity` is the
        // live figure, so wind it back over everything that has happened since:
        // usage subtracted from it, and later GRN receipts added to it.
        const ownedAtEnd = item.totalQuantity + issuedAfterPeriod - receivedAfterPeriod;
        const ownedAtStart = ownedAtEnd + issuedInPeriod - received;

        // Opening is what physically sat in the warehouse when the period began:
        // owned stock minus whatever workers were holding at that moment.
        const opening = ownedAtStart - assignedOutAt(item.id, from);

        // Everything ever issued out to a worker, per the ASN documents, falling
        // back to the live snapshot on the row for stock assigned without one.
        const assigned = assignedByItem.get(item.id) ?? item.assignedQuantity ?? 0;

        // Assigned is an all-time running total while Opening, Received and Issued
        // are period movements, so this is not a ledger that closes — a hand-out
        // made before the period still draws Closing down. The floor keeps that
        // mismatch from surfacing as a negative stock figure.
        const closing = Math.max(0, opening + received - assigned - issuedInPeriod);

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
  }, [list, usage, assignments, receiptsByItem, assignedByItem, dateFrom, dateTo, search, schemeFilters, categoryFilters]);

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
        {' '}Opening = stock in the warehouse when the period began · Received = stock formally receipted via GRN in this period · Assigned = all stock ever handed out to workers on an issued Assignment Form (a running total, not limited to this period) · Issued = stock consumed/used in this period · Closing = Opening + Received − Assigned − Issued = stock left in the warehouse. Stock held by workers is out of the warehouse but not yet consumed, so it reduces Closing without counting as Issued.
      </div>
    </div>
  );
}