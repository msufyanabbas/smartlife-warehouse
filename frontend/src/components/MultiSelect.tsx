import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Checkbox dropdown for filters that read as "any of these", e.g. several
 * schemes at once. An empty selection means "no filter" rather than "nothing
 * matches", which is what the calling page's filter predicate assumes.
 */
export default function MultiSelect({ options, selected, onChange, placeholder }: {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (option: string) =>
    onChange(selected.includes(option)
      ? selected.filter(s => s !== option)
      : [...selected, option]);

  const label = selected.length === 0 ? placeholder
    : selected.length === 1 ? selected[0]
    : `${selected.length} selected`;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="form-input"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, width: '100%', textAlign: 'left', cursor: 'pointer',
          color: selected.length === 0 ? 'var(--text-3)' : 'var(--text)',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <ChevronDown size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 50,
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          maxHeight: 240, overflowY: 'auto', padding: '6px 0',
        }}>
          {options.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-3)' }}>
              Nothing to filter by
            </div>
          ) : (
            <>
              <div style={{
                display: 'flex', gap: 8, alignItems: 'center',
                padding: '2px 14px 8px', borderBottom: '1px solid var(--border)',
              }}>
                <button type="button" onClick={() => onChange([...options])}
                  style={{ ...linkButton, color: 'var(--accent)' }}>
                  Select all
                </button>
                <span style={{ color: 'var(--text-3)', fontSize: 11 }}>·</span>
                <button type="button" onClick={() => onChange([])}
                  style={{ ...linkButton, color: 'var(--text-3)' }}>
                  Clear
                </button>
              </div>

              {options.map(option => (
                <label
                  key={option}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 14px', fontSize: 13, color: 'var(--text)', cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggle(option)}
                    style={{ width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {option}
                  </span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const linkButton: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 11,
};
