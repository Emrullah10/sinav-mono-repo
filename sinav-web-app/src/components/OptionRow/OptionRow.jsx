import classNames from 'classnames';
import { Check, X } from 'lucide-react';
import styles from './OptionRow.module.scss';

// Cevap baloncuğu satırı. state: default | selected | correct | wrong | eliminated | disabled | missed
// Doğru/yanlış: renk + ikon + metin birlikte (tasarım ilke 4). status etiketi i18n'den gelir (statusLabel).
export default function OptionRow({ letter, children, state = 'default', onClick, onEliminate, statusLabel, disabled, lang = 'en' }) {
  const isCorrect = state === 'correct';
  const isWrong = state === 'wrong';
  return (
    <button
      type="button"
      className={classNames(styles.row, styles[state])}
      onClick={onClick}
      onContextMenu={(e) => { if (onEliminate) { e.preventDefault(); onEliminate(); } }}
      disabled={disabled || state === 'disabled'}
      aria-pressed={state === 'selected'}
      aria-label={`${letter}. ${typeof children === 'string' ? children : ''}${statusLabel ? ', ' + statusLabel : ''}`}
    >
      <span className={styles.bubble} aria-hidden>{isCorrect ? <Check size={16} /> : isWrong ? <X size={16} /> : letter}</span>
      <span className={classNames(styles.text, 'reading t-reading-s')} lang={lang}>{children}</span>
      {statusLabel && <span className={styles.status}>{statusLabel}</span>}
    </button>
  );
}
