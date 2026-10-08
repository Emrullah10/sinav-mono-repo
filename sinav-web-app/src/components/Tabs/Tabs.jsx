import classNames from 'classnames';
import styles from './Tabs.module.scss';

export default function Tabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className={styles.tabs}>
      {tabs.map((t) => (
        <button key={t.value} role="tab" type="button" aria-selected={value === t.value} className={classNames(styles.tab, value === t.value && styles.on)} onClick={() => onChange(t.value)}>
          {t.label}{t.badge ? <span className={styles.badge}>{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
