import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Activity, Search, Download, Trash2, Filter } from 'lucide-react';
import { useItemUsage, useDeleteUsage, useWorkers, useInventory } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import type { ItemUsage } from '../types';
import { formatDistanceToNow, format } from 'date-fns';

export default function UsagePage() {
  const { user } = useAuth();
  const { data: usage = [], isLoading } = useItemUsage();
  const { data: workers = [] } = useWorkers();
  const { data: inventory = [] } = useInventory();
  const deleteUsage = useDeleteUsage();
  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const [search, setSearch] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const allUsage = usage as ItemUsage[];

  const list = allUsage.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.item?.name.toLowerCase().includes(q) || u.taskNo?.toLowerCase().includes(q) || u.projectName?.toLowerCase().includes(q) || u.workerUser?.firstName.toLowerCase().includes(q);
    const matchWorker = !workerFilter || u.workerUserId === workerFilter;
    const matchItem = !itemFilter || u.itemId === itemFilter;
    const matchTask = !taskFilter || u.taskNo?.toLowerCase().includes(taskFilter.toLowerCase());
    const matchFrom = !dateFrom || new Date(u.usedAt || u.createdAt) >= new Date(dateFrom);
    const matchTo = !dateTo || new Date(u.usedAt || u.createdAt) <= new Date(dateTo + 'T23:59:59');
    return matchSearch && matchWorker && matchItem && matchTask && matchFrom && matchTo;
  });

  const totalUsed = list.reduce((s, u) => s + u.quantityUsed, 0);

  const clearFilters = () => { setSearch(''); setWorkerFilter(''); setItemFilter(''); setTaskFilter(''); setDateFrom(''); setDateTo(''); };
  const hasFilters = search || workerFilter || itemFilter || taskFilter || dateFrom || dateTo;

  const exportExcel = () => {
    const data = list.map(u => ({
      'Worker': `${u.workerUser?.firstName} ${u.workerUser?.lastName}`,
      'Item': u.item?.name, 'SKU': u.item?.sku,
      'Qty Used': u.quantityUsed, 'Task No.': u.taskNo,
      'Project': u.projectName, 'Date Used': u.usedAt ? format(new Date(u.usedAt), 'yyyy-MM-dd') : '',
      'Notes': u.notes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usage Log');
    XLSX.writeFile(wb, `usage-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Unique tasks for filter
  const taskOptions = [...new Set(allUsage.map(u => u.taskNo).filter(Boolean))].sort();

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Usage Log</h1>
          <p>{list.length} records · <strong style={{ color: 'var(--purple)' }}>{totalUsed}</strong> total units consumed{hasFilters ? ' (filtered)' : ''}</p>
        </div>
        <button className="btn btn-ghost" onClick={exportExcel}><Download size={14} /> Export</button>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, alignItems: 'end' }}>
          <div className="search-bar" style={{ gridColumn: '1 / span 2' }}>
            <Search size={14} />
            <input placeholder="Search item, task, project, worker…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {isManager && (
            <select className="form-input" value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}>
              <option value="">All Workers</option>
              {(workers as any[]).map((w: any) => <option key={w.id} value={w.id}>{w.firstName} {w.lastName}</option>)}
            </select>
          )}
          <select className="form-input" value={itemFilter} onChange={e => setItemFilter(e.target.value)}>
            <option value="">All Items</option>
            {(inventory as any[]).map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select className="form-input" value={taskFilter} onChange={e => setTaskFilter(e.target.value)}>
            <option value="">All Tasks</option>
            {taskOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>From</label>
            <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: 11 }}>To</label>
            <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ alignSelf: 'end' }}>
              <Filter size={13} /> Clear
            </button>
          )}
        </div>
        {hasFilters && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
            Showing <strong style={{ color: 'var(--text)' }}>{list.length}</strong> of {allUsage.length} records
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="empty-state"><Activity size={40} /><span>Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="empty-state"><Activity size={40} /><span>No usage records found</span></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {isManager && <th>Worker</th>}
                <th>Item</th>
                <th>SKU</th>
                <th>Task No.</th>
                <th>Project</th>
                <th style={{ textAlign: 'center' }}>Qty Used</th>
                <th>Date Used</th>
                <th>Notes</th>
                <th>Logged</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(u => (
                <tr key={u.id}>
                  {isManager && (
                    <td style={{ fontWeight: 500 }}>{u.workerUser?.firstName} {u.workerUser?.lastName}</td>
                  )}
                  <td style={{ fontWeight: 500 }}>{u.item?.name}</td>
                  <td><code style={{ fontSize: 11, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--accent)' }}>{u.item?.sku}</code></td>
                  <td><span className="badge badge-blue">{u.taskNo}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{u.projectName}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--purple)' }}>{u.quantityUsed}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{u.usedAt ? format(new Date(u.usedAt), 'dd MMM yyyy') : '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.notes || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}</td>
                  <td>
                    {(user?.role === 'admin' || u.workerUserId === user?.id) && (
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => { if (confirm('Delete this usage record? This will restore the stock.')) deleteUsage.mutate(u.id); }}>
                        <Trash2 size={13} />
                      </button>
                    )}
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