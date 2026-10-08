export default function Avatar({ name = '', size = 40 }) {
  const initial = (name.trim()[0] || '?').toLocaleUpperCase('tr-TR');
  return (
    <span aria-hidden style={{ width: size, height: size, borderRadius: '50%', background: 'var(--color-accent-subtle-bg)', color: 'var(--color-accent-subtle-fg)', display: 'inline-grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.4, flex: 'none' }}>
      {initial}
    </span>
  );
}
