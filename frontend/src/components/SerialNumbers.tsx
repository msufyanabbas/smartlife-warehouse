import { splitSerials } from './documents/lineRows';

/**
 * A line item can carry one serial per unit, stored as a comma-separated string.
 * Rendering them as separate badges keeps a long list readable in a table cell.
 */
export default function SerialNumbers({ value, empty = '—' }: {
  value?: string | string[] | null;
  empty?: string;
}) {
  const serials = splitSerials(value ?? undefined);

  if (!serials.length) {
    return <span style={{ color: 'var(--text-3)' }}>{empty}</span>;
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {serials.map((serial, index) => (
        <code
          key={`${serial}-${index}`}
          style={{
            fontSize: 11, fontFamily: 'monospace', background: 'var(--bg-3)',
            padding: '1px 6px', borderRadius: 4, color: 'var(--accent)',
          }}
        >
          {serial}
        </code>
      ))}
    </div>
  );
}
