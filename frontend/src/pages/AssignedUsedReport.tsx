import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ClipboardList, Download, Filter, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useAssignedUsedReport } from '../hooks/useApi';
import SerialNumbers from '../components/SerialNumbers';
import { uniqueSorted } from '../components/documents/formUtils';
import type { AssignedUsedReportRow } from '../types';

const STATUS_STYLE: Record<AssignedUsedReportRow['status'], string> = {
  assigned: 'badge-blue',
  used: 'badge-yellow',
  returned: 'badge-green',
};

export default function AssignedUsedReport() {
  const { data = [], isLoading } = useAssignedUsedReport();
  const allRows = data as AssignedUsedReportRow[];

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const workers = useMemo(() => uniqueSorted(allRows.map(r => r.assignedToName)), [allRows]);
  const schemes = useMemo(() => uniqueSorted(allRows.map(r => r.schemeNo)), [allRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return allRows.filter(row => {
      const haystack = [
        row.itemName, row.sku, row.serialNumber,
        row.assignedToName, row.taskNos.join(' '), row.projectSite,
      ].join(' ').toLowerCase();

      if (q && !haystack.includes(q)) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (workerFilter && row.assignedToName !== workerFilter) return false;
      if (schemeFilter && row.schemeNo !== schemeFilter) return false;

      const assignedAt = new Date(row.assignmentDate);
      if (from && assignedAt < from) return false;
      if (to && assignedAt > to) return false;
      return true;
    });
  }, [allRows, search, statusFilter, workerFilter, schemeFilter, dateFrom, dateTo]);

  const totals = useMemo(() => ({
    assigned: rows.reduce((sum, r) => sum + r.qtyAssigned, 0),
    used: rows.reduce((sum, r) => sum + r.qtyUsed, 0),
  }), [rows]);

  const exportExcel = () => {
    const sheet = rows.map(r => ({
      'Item Name': r.itemName,
      'SKU (Item Code)': r.sku,
      'Serial Number / Site ID': r.serialNumber,
      'Category': r.category,
      'Scheme No.': r.schemeNo,
      'Assigned To': r.assignedToName,
      'Qty Assigned': r.qtyAssigned,
      'Qty Used': r.qtyUsed,
      'Task No.': r.taskNos.join(', '),
      'Project / Site': r.projectSite,
      'Assignment Date': r.assignmentDate ? format(new Date(r.assignmentDate), 'yyyy-MM-dd') : '',
      'Status': r.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Assigned & Used');
    XLSX.writeFile(workbook, `assigned-used-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const clearFilters = () => {
    setSearch(''); setStatusFilter(''); setWorkerFilter('');
    setSchemeFilter(''); setDateFrom(''); setDateTo('');
  };
  const hasFilters = search || statusFilter || workerFilter || schemeFilter || dateFrom || dateTo;

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <p className="text-muted text-sm">
          {rows.length} record{rows.length === 1 ? '' : 's'} · {totals.assigned} assigned · {totals.used} used
        </p>
        <button className="btn btn-ghost" onClick={exportExcel} disabled={rows.length === 0}>
          <Download size={14} /> Export Excel
        </button>
      </div>

      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto auto auto', gap: 10, alignItems: 'end' }}>
          <div className="search-bar">
            <Search size={14} />
            <input
              placeholder="Search item, SKU, serial / site ID, worker, task no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="assigned">Assigned</option>
            <option value="used">Used</option>
            <option value="returned">Returned</option>
          </select>
          <select className="form-input" value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}>
            <option value="">All Workers</option>
            {workers.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <select className="form-input" value={schemeFilter} onChange={e => setSchemeFilter(e.target.value)}>
            <option value="">All Schemes</option>
            {schemes.map(s => <option key={s} value={s}>{s}</option>)}
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
      </div>

      {isLoading ? (
        <div className="empty-state"><span>Loading…</span></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={48} />
          <span>No assigned or used items match these filters</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th>SKU</th>
                <th>Serial No. / Site ID</th>
                <th>Category</th>
                <th>Scheme No.</th>
                <th>Assigned To</th>
                <th style={{ textAlign: 'center' }}>Qty Assigned</th>
                <th style={{ textAlign: 'center' }}>Qty Used</th>
                <th>Task No.</th>
                <th>Project / Site</th>
                <th>Assignment Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 500 }}>{row.itemName}</td>
                  <td>
                    <code style={{ fontSize: 11, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--accent)' }}>
                      {row.sku}
                    </code>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    <SerialNumbers value={row.serialNumber} />
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.category || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.schemeNo || '—'}</td>
                  <td>{row.assignedToName || '—'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{row.qtyAssigned}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: row.qtyUsed > 0 ? 'var(--yellow)' : 'var(--text-3)' }}>
                    {row.qtyUsed || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.taskNos.join(', ') || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.projectSite || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {row.assignmentDate ? format(new Date(row.assignmentDate), 'dd MMM yyyy') : '—'}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_STYLE[row.status]}`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
