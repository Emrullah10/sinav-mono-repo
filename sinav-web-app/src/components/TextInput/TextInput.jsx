import { forwardRef, useId } from 'react';
import classNames from 'classnames';
import styles from './TextInput.module.scss';

// Etiket üstte ve hep görünür; yer tutucu etiket değildir. multiline → textarea.
const TextInput = forwardRef(function TextInput({ label, helper, error, multiline = false, rows = 4, className, id, endAdornment, ...rest }, ref) {
  const auto = useId();
  const fid = id || auto;
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className={classNames(styles.field, className)}>
      {label && <label htmlFor={fid} className="t-label-m">{label}</label>}
      <div className={styles.wrap}>
        <Tag ref={ref} id={fid} rows={multiline ? rows : undefined} aria-invalid={!!error} aria-describedby={error || helper ? `${fid}-d` : undefined} className={classNames(styles.input, error && styles.err, multiline && styles.multi)} {...rest} />
        {endAdornment && <span className={styles.end}>{endAdornment}</span>}
      </div>
      {(error || helper) && <p id={`${fid}-d`} className={classNames('t-caption', error ? styles.errText : 'muted')}>{error || helper}</p>}
    </div>
  );
});
export default TextInput;
