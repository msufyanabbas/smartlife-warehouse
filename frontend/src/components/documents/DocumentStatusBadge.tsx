export type DocumentStatus = 'draft' | 'completed' | 'approved' | 'issued';

const STYLES: Record<DocumentStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: '#64748b', bg: 'rgba(100,116,139,0.14)' },
  completed: { label: 'Completed', color: '#16a34a', bg: 'rgba(22,163,74,0.14)' },
  approved: { label: 'Approved', color: '#2563eb', bg: 'rgba(37,99,235,0.14)' },
  issued: { label: 'Issued', color: '#9333ea', bg: 'rgba(147,51,234,0.14)' },
};

export default function DocumentStatusBadge({ status }: { status?: string }) {
  const style = STYLES[(status ?? 'draft') as DocumentStatus] ?? STYLES.draft;
  return (
    <span className="doc-badge" style={{ color: style.color, background: style.bg }}>
      {style.label}
    </span>
  );
}
