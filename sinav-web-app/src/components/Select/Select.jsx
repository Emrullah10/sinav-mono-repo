import { useId } from 'react';
import classNames from 'classnames';
import styles from './Select.module.scss';

export default function Select({ label, options = [], error, helper, className, id, ...rest }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div className={classNames(styles.field, className)}>
      {label && <label htmlFor={fid} className="t-label-m">{label}</label>}
      <select id={fid} className={classNames(styles.sel, error && styles.err)} aria-invalid={!!error} {...rest}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {(error || helper) && <p className={classNames('t-caption', error ? styles.errText : 'muted')}>{error || helper}</p>}
    </div>
  );
}
