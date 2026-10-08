import styles from './ProgressBar.module.scss';

// value 0–100. segments verilirse bölümlü (7/10) görünür.
export default function ProgressBar({ value = 0, size = 'md', label, segments, tone = 'accent' }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`${styles.wrap} ${styles[size]}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      {segments ? (
        <div className={styles.segs}>{Array.from({ length: segments.total }, (_x, i) => <i key={i} className={i < segments.done ? styles.on : ''} />)}</div>
      ) : (
        <div className={`${styles.bar} ${styles[tone]}`} style={{ width: `${v}%` }} />
      )}
    </div>
  );
}
