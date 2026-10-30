// Marka işareti (uygulama ikonu ve favicon ile aynı geometri): açık halka = ilerleme, amber nokta = odak.
export default function BrandMark({ size = 32, title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M769.2 462.0A262 262 0 1 1 534.8 251.0" fill="none" stroke="var(--color-accent-default)" strokeWidth="112" strokeLinecap="round" />
      <circle cx="687.3" cy="317.3" r="64" fill="var(--color-reward-default)" />
    </svg>
  );
}
