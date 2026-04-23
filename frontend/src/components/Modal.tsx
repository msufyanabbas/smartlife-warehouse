import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = { sm: 400, md: 520, lg: 680, xl: 960 };

export default function Modal({ isOpen, onClose, title, children, footer, maxWidth, size = 'md' }: Props) {
  const width = maxWidth ?? sizeMap[size];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: width, width: '95vw' }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose} style={{ padding: 6 }}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}