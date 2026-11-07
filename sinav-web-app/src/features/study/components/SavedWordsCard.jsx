import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Bookmark, Layers } from 'lucide-react';
import { queryKeys } from '@sinav/client-sdk';
import api from '@api';
import Routes from '@shared/constant/route-paths';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Skeleton from '@components/Skeleton/Skeleton';
import styles from './SavedWords.module.scss';

const PREVIEW = 6;

/**
 * Kelimeler sayfasında desteler arasında "Kaydettiğin kelimeler" kartı: sayılar + son eklenen birkaç kelime + "Tümünü gör".
 * Kelime eklendikçe sayfa uzamaz; tam liste ayrı sayfada (Routes.vocabSaved).
 */
export default function SavedWordsCard() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useQuery({
    queryKey: [...queryKeys.learning.vocabMyWords(), 'preview'],
    queryFn: async () => (await api.learningVocabMyWords({ limit: PREVIEW }))?.data?.data,
  });
  const d = q.data;
  const total = d?.total || 0;
  const c = d?.counts || {};
  const parts = [
    c.due ? t('study.vocab.saved.n.due', { n: c.due }) : null,
    c.new ? t('study.vocab.saved.n.new', { n: c.new }) : null,
    c.learning ? t('study.vocab.saved.n.learning', { n: c.learning }) : null,
    c.review ? t('study.vocab.saved.n.review', { n: c.review }) : null,
  ].filter(Boolean);
  return (
    <Card tone="default">
      <div className={styles.cardBody}>
        <div className={styles.cardHead}>
          <span className={styles.headIcon} aria-hidden><Bookmark size={18} /></span>
          <h3 className="t-title">{t('study.vocab.saved.title')}</h3>
          {total > 0 && <span className={styles.total}>{t('study.vocab.saved.count', { n: total })}</span>}
        </div>
        {q.isLoading ? (
          <Skeleton height={64} />
        ) : !total ? (
          <>
            <p className="t-body-s muted">{t('study.vocab.saved.empty')}</p>
            <div className="row"><Button size="sm" variant="secondary" onClick={() => nav(Routes.library)}>{t('study.vocab.saved.toLibrary')}</Button></div>
          </>
        ) : (
          <>
            <p className="t-body-s muted">{t('study.vocab.saved.short')}</p>
            {parts.length > 0 && <p className="t-caption muted tnum">{parts.join(' · ')}</p>}
            <ul className={styles.preview} aria-label={t('study.vocab.saved.recent')}>
              {d.items.map((w) => <li key={w.cardCode} lang="en">{w.headword}</li>)}
              {total > d.items.length && <li className={styles.previewMore}>{`+${total - d.items.length}`}</li>}
            </ul>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <Button size="sm" startIcon={<Layers size={16} />} onClick={() => nav(`${Routes.vocabReview}?source=saved`)}>{t('study.vocab.saved.study')}</Button>
              <Button size="sm" variant="secondary" endIcon={<ArrowRight size={16} />} onClick={() => nav(Routes.vocabSaved)}>{t('study.vocab.saved.all')}</Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
