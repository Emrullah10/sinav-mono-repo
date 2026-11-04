import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Library as LibraryIcon } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import BookCover from './BookCover';
import { readingKeys } from '../hooks/readingKeys';
import styles from './Reading.module.scss';

/** Çalış ve Bugün girişi. compact: yalnız yarım kalan kitap varsa görünür (Bugün). */
export default function ContinueCard({ compact = false }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useApiQuery(readingKeys.library, () => api.contentReadingLibrary());
  const book = q.data?.continue?.[0];
  if (q.isLoading || q.isError || (compact && !book)) return null;
  if (!book) {
    return (
      <Card>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div className="row" style={{ gap: 'var(--space-4)', minWidth: 0, flex: 1 }}>
            <LibraryIcon size={28} color="var(--color-accent-default)" aria-hidden style={{ flex: 'none' }} />
            <div style={{ minWidth: 0 }}>
              <h2 className="t-title">{t('read.card.title')}</h2>
              <p className="t-body-s muted">{t('read.card.body')}</p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => nav(Routes.library)}>{t('read.card.open')}</Button>
        </div>
      </Card>
    );
  }
  const percent = Math.round(book.progress?.percent || 0);
  return (
    <Card>
      <div className="stack-sm">
        <button type="button" className={styles.book} style={{ width: '100%' }} onClick={() => nav(path(Routes.reader, { code: book.code }))}>
          <div className={styles.continueCard}>
            <BookCover book={book} />
            <div className={styles.continueBody}>
              <span className={styles.overline}>{t('read.continue.title')}</span>
              <span className={`t-title ${styles.clamp2}`}>{book.title}</span>
              <span className="t-body-s muted">{t('read.continue.line', { section: (book.progress?.sectionPosition || 0) + 1, percent })}</span>
              <ProgressBar value={percent} size="sm" label={t('read.reader.percent', { n: percent })} />
            </div>
          </div>
        </button>
        {!compact && <div className="row" style={{ justifyContent: 'flex-end' }}><Button size="sm" variant="tertiary" endIcon={<ChevronRight size={16} />} onClick={() => nav(Routes.library)}>{t('read.card.open')}</Button></div>}
      </div>
    </Card>
  );
}
