import { useEffect, useState } from 'react';

/** Renders in fixed position so a dropdown inside a table cell isn't clipped. */
export default function FloatingDropdown({ anchorRef, children, visible }: {
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  visible: boolean;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (visible && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 320),
        zIndex: 99999,
      });
    }
  }, [visible, anchorRef]);

  if (!visible) return null;
  return (
    <div style={{
      ...style,
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
      maxHeight: 260,
      overflowY: 'auto',
    }}>
      {children}
    </div>
  );
}
