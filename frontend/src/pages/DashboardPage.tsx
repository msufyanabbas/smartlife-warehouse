import { useMemo, type ReactNode } from 'react';
import {
  Package, ClipboardList, AlertCircle, TrendingUp,
  ClipboardCheck, CheckCircle,
} from 'lucide-react';
import {
  useAssignments, usePendingTransfers, usePendingMic,
  useGrnList, useAssignmentForms, useMicList,
} from '../hooks/useApi';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import type {
  TransferRequest, Assignment, MicDocument, GrnDocument, AssignmentForm,
} from '../types';
import { formatDistanceToNow } from 'date-fns';

/**
 * Every figure here is read off the documents — completed GRNs, issued
 * assignment forms, approved MICs — never off the running balances on the
 * inventory row, for the same reason the stock report does not: those balances
 * are a live cursor rewritten in place by each movement, and rows predating a
 * given piece of bookkeeping never received it. The same numbers therefore
 * reconcile with the Reports page.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'admin' || user?.role === 'manager';

  const { data: assignments } = useAssignments();
  const { data: pending } = usePendingTransfers();
  const { data: pendingMic } = usePendingMic(isManager);
  const { data: grnData = [] } = useGrnList();
  const { data: assignmentFormsData = [] } = useAssignmentForms();
  const { data: micData = [] } = useMicList();

  const pendingCount = Array.isArray(pending) ? pending.length : 0;
  const pendingMicList: MicDocument[] = Array.isArray(pendingMic) ? pendingMic : [];
  const assignmentList: Assignment[] = Array.isArray(assignments) ? assignments : [];

  const completedGrns = useMemo(
    () => (grnData as GrnDocument[]).filter(grn => grn.status === 'completed'),
    [grnData],
  );
  const issuedForms = useMemo(
    () => (assignmentFormsData as AssignmentForm[]).filter(form => form.status === 'issued'),
    [assignmentFormsData],
  );

  const docStats = useMemo(() => {
    const totalReceived = completedGrns
      .flatMap(grn => grn.items ?? [])
      .reduce((sum, line) => sum + (line.receivedQty || 0), 0);

    const totalAssigned = issuedForms
      .flatMap(form => form.items ?? [])
      .reduce((sum, line) => sum + (line.qtyIssued || 0), 0);

    const totalInstalled = (micData as MicDocument[])
      .filter(mic => mic.status === 'approved')
      .flatMap(mic => mic.items ?? [])
      .reduce((sum, line) => sum + (line.qtyInstalled || 0), 0);

    return {
      totalReceived,
      totalAssigned,
      totalInstalled,
      // Floored at zero: `assigned` is cumulative, while a return is recorded as
      // an inventory movement and never written back to the form that issued it,
      // so stock handed out and given back counts twice here.
      totalAvailable: Math.max(0, totalReceived - totalAssigned),
      totalGrns: completedGrns.length,
      totalAsns: issuedForms.length,
    };
  }, [completedGrns, issuedForms, micData]);

  const recentAsns = useMemo(
    () => [...issuedForms]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5),
    [issuedForms],
  );

  /**
   * Received and assigned rolled up per scheme. The two sides are keyed off
   * different fields — a GRN records a scheme number, an assignment form records
   * the project/site it went to — so a scheme only nets out here when those two
   * labels are written the same way.
   */
  const schemeStats = useMemo(() => {
    const byScheme = new Map<string, { received: number; assigned: number }>();
    const entry = (key: string) => {
      const existing = byScheme.get(key) ?? { received: 0, assigned: 0 };
      byScheme.set(key, existing);
      return existing;
    };

    for (const grn of completedGrns) {
      entry(grn.schemeNo?.trim() || 'Unassigned').received +=
        (grn.items ?? []).reduce((sum, line) => sum + (line.receivedQty || 0), 0);
    }
    for (const form of issuedForms) {
      entry(form.projectSite?.trim() || 'Unassigned').assigned +=
        (form.items ?? []).reduce((sum, line) => sum + (line.qtyIssued || 0), 0);
    }

    return [...byScheme.entries()]
      .map(([scheme, totals]) => ({
        scheme,
        received: totals.received,
        assigned: totals.assigned,
        available: Math.max(0, totals.received - totals.assigned),
      }))
      .sort((a, b) => b.received - a.received)
      .slice(0, 5);
  }, [completedGrns, issuedForms]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const statCard = (
    icon: ReactNode, label: string, value: number, subtitle: string,
    color: string, background: string,
  ) => (
    <div className="stat-card">
      <div className="icon-wrap" style={{ background }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="value" style={{ color }}>{value.toLocaleString()}</div>
        <div className="label">{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: 13, color: 'var(--text-3)', fontWeight: 500, marginBottom: 2,
        }}>
          {greeting()},
        </div>
        <h1>{user?.firstName} {user?.lastName}</h1>
        <p>Here's what's happening in your warehouse today.</p>
      </div>

      {/* Stats — all four derived from documents */}
      {isManager && (
        <div className="grid-4" style={{ marginBottom: 24 }}>
          {statCard(
            <Package size={20} color="var(--blue)" />,
            'Total Received', docStats.totalReceived,
            `${docStats.totalGrns} GRN document${docStats.totalGrns === 1 ? '' : 's'}`,
            'var(--blue)', 'var(--blue-dim)',
          )}
          {statCard(
            <ClipboardList size={20} color="var(--yellow)" />,
            'Assigned', docStats.totalAssigned,
            `${docStats.totalAsns} assignment form${docStats.totalAsns === 1 ? '' : 's'}`,
            'var(--yellow)', 'var(--yellow-dim)',
          )}
          {statCard(
            <TrendingUp size={20} color="var(--green)" />,
            'Available', docStats.totalAvailable,
            'Received minus assigned',
            'var(--green)', 'var(--green-dim)',
          )}
          {statCard(
            <CheckCircle size={20} color="var(--purple)" />,
            'Installed', docStats.totalInstalled,
            'Via approved MIC forms',
            'var(--purple)', 'var(--purple-dim)',
          )}
        </div>
      )}

      <div className="grid-2" style={{ gap: 20 }}>
        {/* Pending transfer requests */}
        {isManager && pendingCount > 0 && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div className="flex items-center gap-2">
                <AlertCircle size={16} color="var(--yellow)" />
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  Pending Transfer Requests
                </span>
                <span className="badge badge-yellow">{pendingCount}</span>
              </div>
              <Link to="/transfers" className="btn btn-ghost btn-sm">View all</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(pending as TransferRequest[]).slice(0, 3).map(tr => (
                <div key={tr.id} style={{
                  background: 'var(--bg-3)', borderRadius: 'var(--radius)',
                  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      <span style={{ color: 'var(--accent)' }}>{tr.fromUser?.firstName} {tr.fromUser?.lastName}</span>
                      <span style={{ color: 'var(--text-3)', margin: '0 6px' }}>→</span>
                      <span style={{ color: 'var(--text)' }}>{tr.toUser?.firstName} {tr.toUser?.lastName}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
                      {tr.quantity}× {tr.item?.name}
                      <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>
                        {formatDistanceToNow(new Date(tr.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <Link to="/transfers" className="btn btn-ghost btn-sm">Review</Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Installation confirmations awaiting sign-off */}
        {isManager && pendingMicList.length > 0 && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <div className="flex items-center gap-2">
                <ClipboardCheck size={16} color="var(--yellow)" />
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  MIC Forms Pending Approval
                </span>
                <span className="badge badge-yellow">{pendingMicList.length}</span>
              </div>
              <Link to="/forms/mic" className="btn btn-ghost btn-sm">View all</Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingMicList.slice(0, 3).map(mic => (
                <div key={mic.id} style={{
                  background: 'var(--bg-3)', borderRadius: 'var(--radius)',
                  padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      <span style={{ color: 'var(--accent)' }}>{mic.micNo}</span>
                      {mic.siteId && <span style={{ color: 'var(--text-2)', marginLeft: 8 }}>{mic.siteId}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
                      {mic.installedBy
                        ? `${mic.installedBy.firstName} ${mic.installedBy.lastName}`
                        : 'Unknown installer'}
                      <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>
                        {formatDistanceToNow(new Date(mic.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <Link to="/forms/mic" className="btn btn-ghost btn-sm">Review</Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {isManager ? (
          <>
            {/* Recent hand-outs, read off the assignment forms themselves */}
            <div className="card">
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  Recent Assignments
                </span>
                <Link to="/forms/assignments" className="btn btn-ghost btn-sm">View all</Link>
              </div>
              {recentAsns.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 0' }}>
                  <ClipboardList size={32} />
                  <span style={{ fontSize: 13 }}>No issued assignment forms</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {recentAsns.map(asn => (
                    <div key={asn.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent)' }}>
                          {asn.assignmentNo}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                          {asn.items?.length ?? 0} item{(asn.items?.length ?? 0) === 1 ? '' : 's'}
                          {' · '}{asn.projectSite || 'No site'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          {asn.assignedTo
                            ? `${asn.assignedTo.firstName} ${asn.assignedTo.lastName}`
                            : '—'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                          {formatDistanceToNow(new Date(asn.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Received vs assigned per scheme */}
            <div className="card">
              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                  Stock by Scheme
                </span>
                <Link to="/stock-report" className="btn btn-ghost btn-sm">Full report</Link>
              </div>
              {schemeStats.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 0' }}>
                  <Package size={32} />
                  <span style={{ fontSize: 13 }}>No completed GRNs yet</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {schemeStats.map(scheme => {
                    const pct = scheme.received > 0
                      ? (scheme.available / scheme.received) * 100
                      : 0;
                    const color = scheme.available === 0
                      ? 'var(--red)'
                      : pct < 30 ? 'var(--yellow)' : 'var(--green)';
                    return (
                      <div key={scheme.scheme}>
                        <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{scheme.scheme}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            {scheme.available}/{scheme.received}
                          </span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>My Assigned Items</span>
            </div>
            {assignmentList.filter(a => a.assignedToId === user?.id).length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 0' }}>
                <Package size={32} />
                <span style={{ fontSize: 13 }}>No items assigned to you</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {assignmentList.filter(a => a.assignedToId === user?.id).map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: 'var(--bg-3)', borderRadius: 'var(--radius)',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{a.item?.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.item?.sku}</div>
                    </div>
                    <span className="badge badge-blue">{a.quantity}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
