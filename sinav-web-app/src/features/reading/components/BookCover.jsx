import classNames from 'classnames';
import { FileText } from 'lucide-react';
import styles from './Reading.module.scss';

const hash = (s) => [...String(s)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Üretilen kapak: renk başlıktan gelir, aynı kitap her yerde aynı görünür. */
export default function BookCover({ book, className }) {
  const tone = hash(book.title) % 3;
  return (
    <div className={classNames(styles.cover, styles[`tone${tone}`], className)} aria-hidden>
      {book.kind === 'personal' ? <FileText size={16} className={styles.coverIcon} /> : <span />}
      <div>
        <div className={styles.coverTitle}>{book.title}</div>
        {book.author && <div className={styles.coverAuthor}>{book.author}</div>}
      </div>
    </div>
  );
}
