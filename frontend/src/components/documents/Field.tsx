export default function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="doc-field">
      <span className="doc-field-label">{label}</span>
      {children}
    </div>
  );
}
