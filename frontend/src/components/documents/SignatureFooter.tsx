export default function SignatureFooter({ labels }: { labels: string[] }) {
  return (
    <div
      className="doc-signatures"
      style={{ gridTemplateColumns: `repeat(${labels.length}, 1fr)` }}
    >
      {labels.map(label => (
        <div key={label}>
          <div className="doc-sign-line">
            <div className="doc-sign-label">{label}</div>
            <div className="doc-sign-hint">Signature &amp; Date</div>
          </div>
        </div>
      ))}
    </div>
  );
}
