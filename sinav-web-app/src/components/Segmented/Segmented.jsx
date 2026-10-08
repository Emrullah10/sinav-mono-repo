import classNames from 'classnames';
import styles from './Segmented.module.scss';

export default function Segmented({ options, value, onChange, label, fullWidth = false }) {
  return (
    <div role="radiogroup" aria-label={label} className={classNames(styles.seg, fullWidth && styles.full)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={classNames(styles.opt, value === o.value && styles.on)} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
