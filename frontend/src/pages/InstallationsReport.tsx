import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ClipboardCheck, Download, Filter, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useMicList } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import SerialNumbers from '../components/SerialNumbers';
import DocumentStatusBadge from '../components/documents/DocumentStatusBadge';
import { uniqueSorted } from '../components/documents/formUtils';
import type { MicDocument, MicItemStatus, MicStatus } from '../types';

interface InstallationRow {
  id: string;
  installationNo: string;
  date: string;
  siteId: string;
  installedById: string;
  installedBy: string;
  itemCode: string;
  itemDescription: string;
  unit: string;
  qtyInstalled: number;
  serialNumbers: string;
  status: string;
  projectClient: string;
  department: string;
  micStatus: MicStatus;
}

/** Colour for a line's own outcome — how that item ended up on site. */
const ROW_STATUS_BADGE: Record<MicItemStatus, string> = {
  Installed: 'badge-green',
  Partial: 'badge-yellow',
  Damaged: 'badge-red',
  Delivered: 'badge-blue',
  Pending: 'badge-gray',
};

const STATUS_TABS: { value: '' | MicStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

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
 * What has been recorded against site installations, one row per line rather
 * than one per document — a single MIC covers a whole visit, and the question
 * this answers is "where did this item end up", not "how many forms were filed".
 *
 * Deliberately unfiltered on open: every form at every status, including drafts
 * and lines whose quantity has not been entered yet. A report that silently
 * drops what it considers unfinished reads as "no data" when the real answer is
 * "not confirmed yet", so the status of each line and each form is shown in the
 * table and left to the reader to filter down from.
 */
export default function InstallationsReport() {
  const { user } = useAuth();
  const { data: micData = [], isLoading } = useMicList();

  const [search, setSearch] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | MicStatus>('');

  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const allRows = useMemo((): InstallationRow[] => {
    const documents = micData as MicDocument[];

    return documents
      // A worker sees their own installs; only a manager sees everyone's.
      .filter(mic => isManager || mic.installedById === user?.id)
      .flatMap(mic => {
        // `installedBy` is an eager relation, so the name arrives with the
        // document — no separate user lookup, and it resolves whoever filled the
        // form in rather than workers alone.
        const installedBy = mic.installedBy
          ? `${mic.installedBy.firstName} ${mic.installedBy.lastName}`.trim()
          : '';

        return (mic.items ?? [])
          .map((line, index) => ({ line, index }))
          // A line with no quantity yet is still something the worker entered —
          // it belongs in the report as outstanding, not hidden as absent.
          .filter(({ line }) => line.itemCode?.trim())
          .map(({ line, index }): InstallationRow => ({
            id: `${mic.id}:${index}`,
            installationNo: mic.micNo,
            date: mic.date || mic.createdAt,
            siteId: mic.siteId || '',
            installedById: mic.installedById || '',
            installedBy,
            itemCode: line.itemCode || '',
            itemDescription: line.itemDescription || '',
            unit: line.unit || '',
            qtyInstalled: line.qtyInstalled ?? 0,
            serialNumbers: line.serialNumbers || '',
            status: line.status || '',
            projectClient: mic.projectClient || '',
            department: mic.installDepartment || '',
            micStatus: mic.status,
          }));
      });
  }, [micData, isManager, user?.id]);

  const workers = useMemo(() => uniqueSorted(allRows.map(r => r.installedBy)), [allRows]);
  const sites = useMemo(() => uniqueSorted(allRows.map(r => r.siteId)), [allRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? parseDate(dateFrom) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return allRows.filter(row => {
      const haystack = [
        row.installationNo, row.siteId, row.itemCode, row.itemDescription,
        row.serialNumbers, row.installedBy, row.projectClient, row.department,
      ].join(' ').toLowerCase();

      if (q && !haystack.includes(q)) return false;
      if (workerFilter && row.installedBy !== workerFilter) return false;
      if (siteFilter && row.siteId !== siteFilter) return false;
      if (statusFilter && row.micStatus !== statusFilter) return false;

      if (from || to) {
        const installedAt = parseDate(row.date);
        if (from && installedAt < from) return false;
        if (to && installedAt > to) return false;
      }
      return true;
    });
  }, [allRows, search, workerFilter, siteFilter, dateFrom, dateTo, statusFilter]);

  const totals = useMemo(() => ({
    installed: rows.reduce((sum, r) => sum + r.qtyInstalled, 0),
    sites: new Set(rows.map(r => r.siteId).filter(Boolean)).size,
    forms: new Set(rows.map(r => r.installationNo)).size,
  }), [rows]);

  const exportExcel = () => {
    const sheet = rows.map(r => ({
      'Installation No.': r.installationNo,
      'Date': r.date ? format(parseDate(r.date), 'yyyy-MM-dd') : '',
      'Site ID': r.siteId,
      'Installed By': r.installedBy,
      'Project / Client': r.projectClient,
      'Department': r.department,
      'Item Code': r.itemCode,
      'Item Description': r.itemDescription,
      'Unit': r.unit,
      'Qty Installed': r.qtyInstalled,
      'Serial Number(s)': r.serialNumbers,
      'Row Status': r.status,
      'MIC Status': r.micStatus,
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Installations');
    XLSX.writeFile(workbook, `installations-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const clearFilters = () => {
    setSearch(''); setWorkerFilter(''); setSiteFilter('');
    setDateFrom(''); setDateTo(''); setStatusFilter('');
  };
  const hasFilters = search || workerFilter || siteFilter || dateFrom || dateTo || statusFilter;

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
          {rows.length} line{rows.length === 1 ? '' : 's'} · {totals.installed} installed · {totals.forms} form{totals.forms === 1 ? '' : 's'}
        </p>
        <button className="btn btn-ghost" onClick={exportExcel} disabled={rows.length === 0}>
          <Download size={14} /> Export Excel
        </button>
      </div>

      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto auto', gap: 10, alignItems: 'end' }}>
          <div className="search-bar">
            <Search size={14} />
            <input
              placeholder="Search installation no., site, item, serial, worker…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="form-input" value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}>
            <option value="">All Workers</option>
            {workers.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <select className="form-input" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
            <option value="">All Sites</option>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>From</label>
            <input type="date" className="form-input" style={{ width: 150 }}
              value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={dateTo || undefined} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>To</label>
            <input type="date" className="form-input" style={{ width: 150 }}
              value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom || undefined} />
          </div>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <Filter size={13} /> Clear
            </button>
          )}
        </div>

        <div className="flex gap-2" style={{ marginTop: 12 }}>
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value || 'all'}
              className={`btn btn-sm ${statusFilter === tab.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {statCard('Line Items', rows.length, 'var(--text)', 'var(--bg-2)')}
        {statCard('Qty Installed', totals.installed, 'var(--green)', 'var(--green-dim)')}
        {statCard('Unique Sites', totals.sites, 'var(--accent)', 'var(--accent-dim)')}
        {statCard('MIC Forms', totals.forms, 'var(--purple)', 'var(--purple-dim)')}
      </div>

      {isLoading ? (
        <div className="empty-state"><span>Loading…</span></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <ClipboardCheck size={48} />
          <span>No MIC line items match these filters</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Installation No.</th>
                <th>Date</th>
                <th>Site ID</th>
                <th>Installed By</th>
                <th>Item Code</th>
                <th>Item Description</th>
                <th>Unit</th>
                <th style={{ textAlign: 'center' }}>Qty Installed</th>
                <th>Serial Number(s)</th>
                <th>Line Status</th>
                <th>MIC Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td><span className="badge badge-blue">{row.installationNo}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                    {row.date ? format(parseDate(row.date), 'dd MMM yyyy') : '—'}
                  </td>
                  <td style={{ fontWeight: 500 }}>{row.siteId || '—'}</td>
                  <td style={{ fontSize: 13 }}>{row.installedBy || '—'}</td>
                  <td>
                    <code style={{ fontSize: 11, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--accent)' }}>
                      {row.itemCode}
                    </code>
                  </td>
                  <td style={{ fontWeight: 500 }}>{row.itemDescription || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.unit || '—'}</td>
                  <td style={{
                    textAlign: 'center', fontWeight: 700,
                    color: row.qtyInstalled > 0 ? 'var(--green)' : 'var(--text-3)',
                  }}>
                    {row.qtyInstalled || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    <SerialNumbers value={row.serialNumbers} />
                  </td>
                  <td>
                    <span className={`badge ${ROW_STATUS_BADGE[row.status as MicItemStatus] ?? 'badge-gray'}`}>
                      {row.status || '—'}
                    </span>
                  </td>
                  <td><DocumentStatusBadge status={row.micStatus} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-3)', fontWeight: 700, fontSize: 13 }}>
                <td colSpan={7} style={{ padding: '10px 16px', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}>
                  Total ({rows.length} line{rows.length === 1 ? '' : 's'})
                </td>
                <td style={{ textAlign: 'center', padding: '10px 16px', color: 'var(--green)' }}>
                  {totals.installed}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--bg-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
        <strong style={{ color: 'var(--text-2)' }}>How it works:</strong>
        {' '}One row per line item across every Material Installation Confirmation, read straight off the documents. Nothing is hidden on open — drafts, lines still awaiting approval and lines with no quantity entered yet all appear, so an empty table means no MIC has been raised rather than none has been signed off. Use the status tabs to narrow to <strong style={{ color: 'var(--text-2)' }}>Approved</strong>, the only status meaning a second person confirmed the install.
      </div>
    </div>
  );
}
