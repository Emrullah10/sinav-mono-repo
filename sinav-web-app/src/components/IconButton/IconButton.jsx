import classNames from 'classnames';
import styles from './IconButton.module.scss';

export default function IconButton({ label, children, className, tone = 'plain', ...rest }) {
  return (
    <button type="button" aria-label={label} title={label} className={classNames(styles.ib, styles[tone], className)} {...rest}>
      {children}
    </button>
  );
}
