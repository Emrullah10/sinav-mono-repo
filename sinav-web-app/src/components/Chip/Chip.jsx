import classNames from 'classnames';
import { Check } from 'lucide-react';
import styles from './Chip.module.scss';

// selected çipte ✓ ikonu görünür (renk tek başına anlam taşımaz).
export default function Chip({ selected = false, tone = 'default', size = 'md', icon, className, children, onClick, ...rest }) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? selected : undefined} className={classNames(styles.chip, styles[size], styles[tone], selected && styles.selected, onClick && styles.click, className)} {...rest}>
      {selected ? <Check size={14} aria-hidden /> : icon}
      {children}
    </Tag>
  );
}
