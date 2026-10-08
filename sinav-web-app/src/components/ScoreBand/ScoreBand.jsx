import styles from './ScoreBand.module.scss';

// 0–100 ölçek, tahmin aralığı bant olarak, hedef çizgisi (safran). Güven düşükse bant geniştir (veri tarafından gelir).
export default function ScoreBand({ low, high, target, max = 100, label }) {
  const pct = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className={styles.wrap} role="img" aria-label={label}>
      <div className={styles.track}>
        {low != null && high != null && <div className={styles.band} style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />}
        {target != null && <div className={styles.target} style={{ left: pct(target) }} />}
      </div>
      <div className={styles.ticks}><span>0</span><span>{max / 2}</span><span>{max}</span></div>
    </div>
  );
}
