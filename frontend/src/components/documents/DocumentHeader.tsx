export default function DocumentHeader({ title, subtitle, refLabel, refNumber }: {
  title: string;
  subtitle?: string;
  refLabel: string;
  refNumber?: string;
}) {
  return (
    <>
      <div className="doc-header">
        <div className="doc-header-brand">
          <img src="/smartlife.png" alt="Smart Life Contracting Company" className="doc-logo" />
          <div>
            <div className="doc-company">
              <span className="doc-company-name">Smart Life</span>{' '}
              <span className="doc-company-suffix">Contracting Company</span>
            </div>
            <div className="doc-company-sub">Warehouse &amp; Inventory Management</div>
          </div>
        </div>
        <div className="doc-header-ref">
          <div className="doc-ref-label">{refLabel}</div>
          <div className="doc-ref-value">{refNumber || 'Auto-generated'}</div>
        </div>
      </div>
      <h2 className="doc-title">
        {title}
        {subtitle && <span className="doc-subtitle">{subtitle}</span>}
      </h2>
    </>
  );
}
