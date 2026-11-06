import classNames from 'classnames';
import styles from './IconTile.module.scss';

// Renkli ikon kutucuğu: ton (teal|indigo|amber|plum) design-tokens tint.* renklerinden gelir; done → başarı rengi.
export default function IconTile({ icon: Icon, hue = 'teal', size = 40, done = false, className }) {
  const style = done
    ? { width: size, height: size, '--tile-fg': 'var(--color-success-fg)', '--tile-bg': 'var(--color-success-bg)' }
    : { width: size, height: size, '--tile-fg': `var(--color-tint-${hue})`, '--tile-bg': `var(--color-tint-${hue}-bg)` };
  return (
    <span className={classNames(styles.tile, size <= 32 && styles.small, className)} style={style} aria-hidden>
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}
