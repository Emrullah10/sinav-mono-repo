import { ChevronRight } from 'lucide-react';
import classNames from 'classnames';
import styles from './ListRow.module.scss';

export default function ListRow({ icon, title, subtitle, value, onClick, to, chevron = true, className, as, children }) {
  const Tag = as || (onClick ? 'button' : 'div');
  return (
    <Tag type={Tag === 'button' ? 'button' : undefined} onClick={onClick} className={classNames(styles.row, onClick && styles.click, className)}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className="grow"><span className="t-title" style={{ display: 'block' }}>{title}</span>{subtitle && <span className="muted t-body-s" style={{ display: 'block' }}>{subtitle}</span>}{children}</span>
      {value != null && <span className="muted t-body-s">{value}</span>}
      {onClick && chevron && <ChevronRight size={18} className="tertiary" aria-hidden />}
    </Tag>
  );
}
