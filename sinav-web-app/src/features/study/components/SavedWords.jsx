import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookmarkPlus, Bookmark, Search } from 'lucide-react';
import classNames from 'classnames';
import { queryKeys } from '@sinav/client-sdk';
import api from '@api';
import Routes, { path } from '@shared/constant/route-paths';
import Button from '@components/Button/Button';
import Segmented from '@components/Segmented/Segmented';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import styles from './SavedWords.module.scss';

const PAGE = 48;
const FILTERS = ['all', 'due', 'new', 'learning'];

/** Kartın durumu → etiket ve ton. Tekrar zamanı gelmiş (yeni olmayan) kart önce gelir. */
const statusOf = (w, now) => {
  if (w.state === 'new') return 'new';
  if (w.dueAt && new Date(w.dueAt).getTime() <= now) return 'due';
  if (w.state === 'learning' || w.state === 'relearning') return 'learning';
  return 'review';
};

/**
 * "Kaydettiğin kelimeler": dokun-çeviriden kartlara eklenen kelimeler (en yeni önce).
 * Kelime kartı → kelimenin ayrıntısı. Çoksa arama ve durum süzgeci. Bağlantıyla gelinirse (#my-words) bölüme kaydırılır.
 */
export default function SavedWords() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { hash } = useLocation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [now] = useState(() => Date.now());
  const q = useInfiniteQuery({
    queryKey: [...queryKeys.learning.vocabMyWords(), 'list'],
    queryFn: async ({ pageParam }) => (await api.learningVocabMyWords({ limit: PAGE, before: pageParam || undefined }))?.data?.data,
    initialPageParam: null,
    getNextPageParam: (last) => last?.nextBefore || undefined,
  });
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (scrolled || hash !== '#my-words' || !q.data) return;
    document.getElementById('my-words')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setScrolled(true);
  }, [hash, q.data, scrolled]);

  const items = (q.data?.pages.flatMap((p) => p?.items || []) || []).map((w) => ({ ...w, status: statusOf(w, now) }));
  const total = q.data?.pages[0]?.total ?? 0;
  const counts = items.reduce((m, w) => ({ ...m, [w.status]: (m[w.status] || 0) + 1 }), {});
  const needle = query.trim().toLocaleLowerCase('tr');
  const shown = items.filter((w) => (filter === 'all' || w.status === filter)
    && (!needle || w.headword.toLocaleLowerCase('tr').includes(needle) || (w.meaning || '').toLocaleLowerCase('tr').includes(needle)));
  const tools = total > 6;

  return (
    <section id="my-words" className={styles.section} aria-labelledby="my-words-h">
      <header className={styles.head}>
        <span className={styles.headIcon} aria-hidden><Bookmark size={18} /></span>
        <div className={styles.headText}>
          <h2 id="my-words-h" className="t-heading-2">{t('study.vocab.saved.title')}</h2>
          <p className="t-body-s muted">{t('study.vocab.saved.body')}</p>
        </div>
        {total > 0 && <span className={styles.total}>{t('study.vocab.saved.count', { n: total })}</span>}
      </header>

      {q.isLoading ? (
        <div className={styles.grid}>{[0, 1, 2].map((i) => <Skeleton key={i} height={104} />)}</div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !items.length ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden><BookmarkPlus size={22} /></span>
          <div className={styles.emptyText}>
            <p className="t-title">{t('study.vocab.saved.emptyTitle')}</p>
            <p className="t-body-s muted">{t('study.vocab.saved.empty')}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => nav(Routes.library)}>{t('study.vocab.saved.toLibrary')}</Button>
        </div>
      ) : (
        <>
          {tools && (
            <div className={styles.tools}>
              <label className={styles.search}>
                <Search size={16} aria-hidden />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('study.vocab.saved.search')} aria-label={t('study.vocab.saved.search')} />
              </label>
              <Segmented
                compact
                label={t('study.vocab.saved.filter')}
                value={filter}
                onChange={setFilter}
                options={FILTERS.filter((f) => f === 'all' || counts[f]).map((f) => ({ value: f, label: f === 'all' ? t('study.vocab.saved.f.all') : `${t(`study.vocab.saved.s.${f}`)} · ${counts[f]}` }))}
              />
            </div>
          )}
          {shown.length ? (
            <ul className={styles.grid}>
              {shown.map((w) => (
                <li key={w.cardCode}>
                  <Link to={path(Routes.vocabWord, { id: w.itemCode })} className={styles.word}>
                    <span className={styles.wordTop}>
                      <span className={styles.headword} lang="en">{w.headword}</span>
                      {w.partOfSpeech && <span className={styles.pos}>{t(`enums.part_of_speech.${w.partOfSpeech}`, { defaultValue: w.partOfSpeech })}</span>}
                    </span>
                    {w.meaning && <span className={styles.meaning}>{w.meaning}</span>}
                    <span className={classNames(styles.status, styles[`s_${w.status}`])}>
                      <i aria-hidden />{t(`study.vocab.saved.s.${w.status}`)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-body-m muted">{t('study.vocab.saved.noMatch')}</p>
          )}
          {q.hasNextPage && (
            <div className={styles.more}>
              <Button variant="secondary" size="sm" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>{t('study.vocab.saved.more')}</Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
