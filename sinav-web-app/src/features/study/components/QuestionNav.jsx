import classNames from 'classnames';
import { Flag } from 'lucide-react';
import styles from './QuestionNav.module.scss';

// Oturumdaki soruların kısa listesi: durum + işaret; tıklayınca o soruya gider.
export default function QuestionNav({ items, current, onGo, label }) {
  return (
    <nav aria-label={label} className={styles.nav}>
      {items.map((i) => (
        <button key={i.position} type="button" aria-current={i.position === current ? 'step' : undefined} aria-label={`${i.position}${i.isFlagged ? ' *' : ''}`}
          className={classNames(styles.dot, i.position === current && styles.cur, i.status === 'answered' && styles.done, i.isCorrect === true && styles.ok, i.isCorrect === false && styles.bad)}
          onClick={() => onGo(i.position)}>
          {i.position}{i.isFlagged && <Flag size={10} className={styles.flag} aria-hidden />}
        </button>
      ))}
    </nav>
  );
}
