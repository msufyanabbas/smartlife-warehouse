import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ClipboardList, Download, Filter, Search } from 'lucide-react';
import { format } from 'date-fns';
import { useAssignmentForms } from '../hooks/useApi';
import SerialNumbers from '../components/SerialNumbers';
import { uniqueSorted } from '../components/documents/formUtils';

interface AsnUser {
  firstName?: string; lastName?: string;
}

interface AsnLine {
  itemCode?: string; itemDescription?: string; unit?: string;
  serialNumber?: string; qtyIssued?: number; itemId?: string;
}

interface AsnForm {
  id: string; assignmentNo: string; status: string;
  date?: string; createdAt: string;
  projectSite?: string; department?: string; priority?: string;
  assignedToId?: string;
  assignedTo?: AsnUser | null;
  requestedBy?: AsnUser | null;
  items?: AsnLine[];
}

interface IssuedRow {
  id: string;
  assignmentNo: string;
  date: string;
  assignedToId: string;
  assignedTo: string;
  requestedBy: string;
  itemCode: string;
  itemDescription: string;
  unit: string;
  serialNumber: string;
  qtyIssued: number;
  projectSite: string;
  department: string;
  priority: string;
}

const fullName = (user?: AsnUser | null) =>
  user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '';

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
 * Every issued line on every issued assignment form, read straight off the
 * documents.
 *
 * The assignments table is deliberately not consulted. It is filled by
 * `issueItems()` as a side effect of issuing, which skips lines carrying no
 * `itemId` and runs outside a transaction, so a form can be issued without
 * opening any assignment — and hand-outs recorded that way are missing from it
 * altogether. The document is the record of the hand-out, and it is complete.
 *
 * The cost is consumption: usage rows are keyed to an assignment, so what a
 * worker has since used or handed back cannot be reached from here. This tab
 * reports what was issued, not what became of it.
 */
export default function AssignedUsedReport() {
  const { data: formsData = [], isLoading } = useAssignmentForms();

  const [search, setSearch] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const allRows = useMemo((): IssuedRow[] => {
    const forms = formsData as AsnForm[];
    return forms
      .filter(form => form.status === 'issued')
      .flatMap(form => {
        // `assignedTo` and `requestedBy` are eager relations on the form, so the
        // names arrive with the document — no separate user lookup, and it
        // resolves recipients of any role rather than workers alone.
        const assignedTo = fullName(form.assignedTo);
        const requestedBy = fullName(form.requestedBy);
        const date = form.date || form.createdAt;

        return (form.items ?? [])
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => line.itemCode?.trim() && (line.qtyIssued ?? 0) > 0)
          .map(({ line, index }) => ({
            id: `${form.id}:${index}`,
            assignmentNo: form.assignmentNo,
            date,
            assignedToId: form.assignedToId || '',
            assignedTo,
            requestedBy,
            itemCode: line.itemCode || '',
            itemDescription: line.itemDescription || '',
            unit: line.unit || '',
            serialNumber: line.serialNumber || '',
            qtyIssued: line.qtyIssued ?? 0,
            projectSite: form.projectSite || '',
            department: form.department || '',
            priority: form.priority || '',
          }));
      });
  }, [formsData]);

  const workers = useMemo(() => uniqueSorted(allRows.map(r => r.assignedTo)), [allRows]);
  const sites = useMemo(() => uniqueSorted(allRows.map(r => r.projectSite)), [allRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? parseDate(dateFrom) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return allRows.filter(row => {
      const haystack = [
        row.itemCode, row.itemDescription, row.serialNumber,
        row.assignmentNo, row.assignedTo, row.projectSite, row.department,
      ].join(' ').toLowerCase();

      if (q && !haystack.includes(q)) return false;
      if (workerFilter && row.assignedTo !== workerFilter) return false;
      if (siteFilter && row.projectSite !== siteFilter) return false;

      if (from || to) {
        const issuedAt = parseDate(row.date);
        if (from && issuedAt < from) return false;
        if (to && issuedAt > to) return false;
      }
      return true;
    });
  }, [allRows, search, workerFilter, siteFilter, dateFrom, dateTo]);

  const totals = useMemo(() => ({
    issued: rows.reduce((sum, r) => sum + r.qtyIssued, 0),
    forms: new Set(rows.map(r => r.assignmentNo)).size,
  }), [rows]);

  const exportExcel = () => {
    const sheet = rows.map(r => ({
      'Assignment No.': r.assignmentNo,
      'Date': r.date ? format(parseDate(r.date), 'yyyy-MM-dd') : '',
      'Assigned To': r.assignedTo,
      'Requested By': r.requestedBy,
      'Item Code': r.itemCode,
      'Description': r.itemDescription,
      'Unit': r.unit,
      'Serial No.': r.serialNumber,
      'Qty Issued': r.qtyIssued,
      'Project / Site': r.projectSite,
      'Department': r.department,
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Issued Items');
    XLSX.writeFile(workbook, `issued-items-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const clearFilters = () => {
    setSearch(''); setWorkerFilter('');
    setSiteFilter(''); setDateFrom(''); setDateTo('');
  };
  const hasFilters = search || workerFilter || siteFilter || dateFrom || dateTo;

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <p className="text-muted text-sm">
          {rows.length} line{rows.length === 1 ? '' : 's'} · {totals.issued} issued · {totals.forms} form{totals.forms === 1 ? '' : 's'}
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
              placeholder="Search item code, description, serial, ASN no, worker…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="form-input" value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}>
            <option value="">All Workers</option>
            {workers.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <select className="form-input" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
            <option value="">All Projects / Sites</option>
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
      </div>

      {isLoading ? (
        <div className="empty-state"><span>Loading…</span></div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={48} />
          <span>No issued assignment form lines match these filters</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Assignment No.</th>
                <th>Date</th>
                <th>Assigned To</th>
                <th>Item Code</th>
                <th>Item Description</th>
                <th>Unit</th>
                <th>Serial No.</th>
                <th style={{ textAlign: 'center' }}>Qty Issued</th>
                <th>Project / Site</th>
                <th>Department</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td><span className="badge badge-blue">{row.assignmentNo}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {row.date ? format(parseDate(row.date), 'dd MMM yyyy') : '—'}
                  </td>
                  <td>{row.assignedTo || '—'}</td>
                  <td>
                    <code style={{ fontSize: 11, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--accent)' }}>
                      {row.itemCode}
                    </code>
                  </td>
                  <td style={{ fontWeight: 500 }}>{row.itemDescription || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.unit || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    <SerialNumbers value={row.serialNumber} />
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.qtyIssued}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.projectSite || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{row.department || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
