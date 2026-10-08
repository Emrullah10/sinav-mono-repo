// Günlük hedef / ustalık halkası. value 0–100; children ortada.
export default function ProgressRing({ value = 0, size = 96, stroke = 8, tone = 'accent', label, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const color = tone === 'reward' ? 'var(--color-reward-default)' : tone === 'success' ? 'var(--color-success-fg)' : 'var(--color-accent-default)';
  return (
    <div style={{ position: 'relative', width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-border-subtle)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} style={{ transition: 'stroke-dashoffset 400ms ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}
