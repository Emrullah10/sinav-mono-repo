import classNames from 'classnames';
import { Info, AlertTriangle, CheckCircle2, XCircle, X } from 'lucide-react';
import styles from './Banner.module.scss';

const ICONS = { info: Info, warning: AlertTriangle, success: CheckCircle2, error: XCircle, accent: Info };
export default function Banner({ tone = 'info', title, children, action, onClose, className }) {
  const Icon = ICONS[tone] || Info;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={classNames(styles.b, styles[tone], className)}>
      <Icon size={20} aria-hidden />
      <div className="grow">{title && <strong>{title}</strong>} {children}</div>
      {action}
      {onClose && <button type="button" className={styles.x} aria-label="Kapat" onClick={onClose}><X size={16} /></button>}
    </div>
  );
}
