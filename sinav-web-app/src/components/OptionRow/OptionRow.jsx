import classNames from 'classnames';
import { Check, X } from 'lucide-react';
import styles from './OptionRow.module.scss';

// Cevap baloncuğu satırı. state: default | selected | correct | wrong | eliminated | disabled | missed
// Doğru/yanlış: renk + ikon + metin birlikte (tasarım ilke 4). status etiketi i18n'den gelir (statusLabel).
// readOnly: cevaplanmış soruda düğme yerine düz kutu çizilir (içindeki dokun-çevir kelimeleri tıklanabilsin; devre dışı
// düğme çocuklarına tıklama iletmez). text: erişilebilir ad için düz metin (children metin değilse).
export default function OptionRow({ letter, children, state = 'default', onClick, onEliminate, statusLabel, disabled, lang = 'en', readOnly = false, text }) {
  const isCorrect = state === 'correct';
  const isWrong = state === 'wrong';
  const label = `${letter}. ${text ?? (typeof children === 'string' ? children : '')}${statusLabel ? ', ' + statusLabel : ''}`;
  const inner = (
    <>
      <span className={styles.bubble} aria-hidden>{isCorrect ? <Check size={16} /> : isWrong ? <X size={16} /> : letter}</span>
      <span className={classNames(styles.text, 'reading t-reading-s')} lang={lang}>{children}</span>
      {statusLabel && <span className={styles.status}>{statusLabel}</span>}
    </>
  );
  if (readOnly) return <div className={classNames(styles.row, styles[state], styles.readOnly)} role="group" aria-label={label}>{inner}</div>;
  return (
    <button
      type="button"
      className={classNames(styles.row, styles[state])}
      onClick={onClick}
      onContextMenu={(e) => { if (onEliminate) { e.preventDefault(); onEliminate(); } }}
      disabled={disabled || state === 'disabled'}
      aria-pressed={state === 'selected'}
      aria-label={label}
    >
      {inner}
    </button>
  );
}
