import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookmarkPlus, Search } from 'lucide-react';
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
const FILTERS = ['all', 'due', 'new', 'learning', 'review'];

/** Kartın durumu (sunucunun süzgeciyle aynı kural). */
const statusOf = (w, now) => {
  if (w.state === 'new') return 'new';
  if (w.dueAt && new Date(w.dueAt).getTime() <= now) return 'due';
  if (w.state === 'learning' || w.state === 'relearning') return 'learning';
  return 'review';
};

/**
 * Kaydettiğin kelimelerin tam listesi (ayrı sayfa): kelime kartları ızgarası; arama ve durum süzgeci sunucuda
 * (sayfalamayla tutarlı). Kelime kartı → kelimenin ayrıntısı.
 */
export default function SavedWords() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [needle, setNeedle] = useState('');
  const [filter, setFilter] = useState('all');
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const id = setTimeout(() => setNeedle(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);
  const q = useInfiniteQuery({
    queryKey: [...queryKeys.learning.vocabMyWords(), 'list', filter, needle],
    queryFn: async ({ pageParam }) => (await api.learningVocabMyWords({
      limit: PAGE, before: pageParam || undefined, status: filter === 'all' ? undefined : filter, q: needle || undefined,
    }))?.data?.data,
    initialPageParam: null,
    getNextPageParam: (last) => last?.nextBefore || undefined,
    placeholderData: keepPreviousData,
  });
  const first = q.data?.pages[0];
  const total = first?.total ?? 0;
  const counts = first?.counts || {};
  const items = (q.data?.pages.flatMap((p) => p?.items || []) || []).map((w) => ({ ...w, status: statusOf(w, now) }));

  if (q.isLoading) return <div className={styles.grid}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={104} />)}</div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  if (!total) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon} aria-hidden><BookmarkPlus size={22} /></span>
        <div className={styles.emptyText}>
          <p className="t-title">{t('study.vocab.saved.emptyTitle')}</p>
          <p className="t-body-s muted">{t('study.vocab.saved.empty')}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => nav(Routes.library)}>{t('study.vocab.saved.toLibrary')}</Button>
      </div>
    );
  }
  return (
    <div className={styles.section}>
      <div className={styles.tools}>
        <label className={styles.search}>
          <Search size={16} aria-hidden />
          <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('study.vocab.saved.search')} aria-label={t('study.vocab.saved.search')} />
        </label>
        <Segmented
          compact
          label={t('study.vocab.saved.filter')}
          value={filter}
          onChange={setFilter}
          options={FILTERS.filter((f) => f === 'all' || counts[f] || f === filter).map((f) => ({
            value: f,
            label: f === 'all' ? `${t('study.vocab.saved.f.all')} · ${total}` : `${t(`study.vocab.saved.s.${f}`)} · ${counts[f] || 0}`,
          }))}
        />
      </div>
      {items.length ? (
        <ul className={classNames(styles.grid, q.isPlaceholderData && styles.stale)}>
          {items.map((w) => (
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
    </div>
  );
}
