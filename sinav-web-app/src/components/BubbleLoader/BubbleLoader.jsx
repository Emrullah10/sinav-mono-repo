import styles from './BubbleLoader.module.scss';

// Beş baloncuğun sırayla dolması (marka yükleme göstergesi).
export default function BubbleLoader({ fullscreen = false, label }) {
  return (
    <div className={fullscreen ? styles.full : styles.inline} role="status" aria-live="polite" aria-label={label || 'Yükleniyor'}>
      <div className={styles.row}>{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ animationDelay: `${i * 140}ms` }} />)}</div>
    </div>
  );
}
