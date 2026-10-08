import classNames from 'classnames';
import styles from './Button.module.scss';

// variant: primary | secondary | tertiary | destructive; size: lg(52) | md(44) | sm(36); block = tam genişlik
export default function Button({ variant = 'primary', size = 'md', block = false, loading = false, startIcon, endIcon, className, children, disabled, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      className={classNames(styles.btn, styles[variant], styles[size], block && styles.block, loading && styles.loading, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {startIcon && <span className={styles.icon} aria-hidden>{startIcon}</span>}
      <span className={styles.label}>{children}</span>
      {endIcon && <span className={styles.icon} aria-hidden>{endIcon}</span>}
      {loading && <span className={styles.spin} aria-hidden />}
    </button>
  );
}
