import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Activity, Search, Trash2, Download } from 'lucide-react';
import { useItemUsage, useDeleteUsage, useWorkers, useInventory } from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import type { ItemUsage } from '../types';
import { format, formatDistanceToNow } from 'date-fns';

export default function UsagePage() {
  const { user } = useAuth();
  const { data: logs = [], isLoading } = useItemUsage();
  const { data: workers = [] } = useWorkers();
  const { data: inventory = [] } = useInventory();
  const deleteUsage = useDeleteUsage();

  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const [search, setSearch] = useState('');
  const [workerFilter, setWorkerFilter] = useState('');
  const [itemFilter, setItemFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  const allLogs = logs as ItemUsage[];

  const uniqueTasks = [...new Set(allLogs.map(l => l.taskNo).filter(Boolean))];
  const uniqueProjects = [...new Set(allLogs.map(l => l.projectName).filter(Boolean))];

  const filtered = allLogs.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      l.item?.name.toLowerCase().includes(q) ||
      l.taskNo?.toLowerCase().includes(q) ||
      l.projectName?.toLowerCase().includes(q) ||
      l.workerUser?.firstName.toLowerCase().includes(q) ||
      l.workerUser?.lastName.toLowerCase().includes(q);
    const matchWorker = !workerFilter || l.workerUserId === workerFilter;
    const matchItem = !itemFilter || l.itemId === itemFilter;
    const matchTask = !taskFilter || l.taskNo === taskFilter;
    const matchProject = !projectFilter || l.projectName === projectFilter;
    return matchSearch && matchWorker && matchItem && matchTask && matchProject;
  });

  const activeFilters = [workerFilter, itemFilter, taskFilter, projectFilter].filter(Boolean).length;
  const totalUsed = filtered.reduce((s, l) => s + l.quantityUsed, 0);

  const clearFilters = () => {
    setWorkerFilter(''); setItemFilter(''); setTaskFilter('');
    setProjectFilter(''); setSearch('');
  };

  const exportToExcel = () => {
    const rows = filtered.map(l => ({
      'Item': l.item?.name,
      'SKU': l.item?.sku,
      'Worker': `${l.workerUser?.firstName} ${l.workerUser?.lastName}`,
      'Task No.': l.taskNo,
      'Project': l.projectName,
      'Qty Used': l.quantityUsed,
      'Date Used': l.usedAt ? format(new Date(l.usedAt), 'dd/MM/yyyy') : '',
      'Notes': l.notes || '',
      'Logged': format(new Date(l.createdAt), 'dd/MM/yyyy HH:mm'),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usage Log');
    XLSX.writeFile(wb, `usage-log-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Usage Log</h1>
          <p>{filtered.length} records · {totalUsed} total units used</p>
        </div>
        {filtered.length > 0 && (
          <button className="btn btn-ghost" onClick={exportToExcel}>
            <Download size={14} /> Export Excel
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 20 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Filters {activeFilters > 0 && <span className="badge badge-blue" style={{ marginLeft: 6 }}>{activeFilters}</span>}
          </span>
          {(activeFilters > 0 || search) && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear all</button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          <div className="search-bar" style={{ gridColumn: '1 / -1' }}>
            <Search size={14} />
            <input placeholder="Search item, task, project, worker…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} />
          </div>
          {isManager && (
            <select className="form-input" value={workerFilter} onChange={e => setWorkerFilter(e.target.value)}>
              <option value="">All Workers</option>
              {(workers as any[]).map(w => (
                <option key={w.id} value={w.id}>{w.firstName} {w.lastName}</option>
              ))}
            </select>
          )}
          <select className="form-input" value={itemFilter} onChange={e => setItemFilter(e.target.value)}>
            <option value="">All Items</option>
            {(inventory as any[]).map((i: any) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <select className="form-input" value={taskFilter} onChange={e => setTaskFilter(e.target.value)}>
            <option value="">All Tasks</option>
            {uniqueTasks.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-input" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
            <option value="">All Projects</option>
            {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state"><Activity size={40} /><span>Loading…</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Activity size={40} />
          <span>No usage records found</span>
          <span style={{ fontSize: 12 }}>Workers can log usage from the Assignments page</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                {isManager && <th>Worker</th>}
                <th>Task No.</th>
                <th>Project</th>
                <th>Qty Used</th>
                <th>Date Used</th>
                <th>Logged</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => (
                <tr key={log.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{log.item?.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{log.item?.sku}</div>
                  </td>
                  {isManager && (
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {log.workerUser?.firstName} {log.workerUser?.lastName}
                      </div>
                    </td>
                  )}
                  <td>
                    <span className="badge badge-purple">{log.taskNo}</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{log.projectName}</td>
                  <td>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{log.quantityUsed}×</span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    {log.usedAt ? format(new Date(log.usedAt), 'dd MMM yyyy') : '—'}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 160 }}>
                    {log.notes || '—'}
                  </td>
                  <td>
                    {(user?.role === 'admin' || log.workerUserId === user?.id) && (
                      <button className="btn btn-danger btn-sm btn-icon"
                        onClick={() => { if (confirm('Delete this usage record?')) deleteUsage.mutate(log.id); }}>
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