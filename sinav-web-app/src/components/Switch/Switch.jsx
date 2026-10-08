import { useId } from 'react';
import styles from './Switch.module.scss';

// Yalnızca anında etkili ayarlar için. Hedef 44px.
export default function Switch({ checked, onChange, label, description, disabled }) {
  const id = useId();
  return (
    <label htmlFor={id} className={styles.row}>
      <span className="grow"><span className="t-title">{label}</span>{description && <span className="muted t-body-s" style={{ display: 'block' }}>{description}</span>}</span>
      <input id={id} type="checkbox" role="switch" className={styles.input} checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span className={styles.track} aria-hidden><i /></span>
    </label>
  );
}
