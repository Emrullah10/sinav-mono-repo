import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Routes, { path } from '@shared/constant/route-paths';
import { queryKeys } from '@sinav/client-sdk';
import { queryClient } from '@shared/providers/QueryProvider';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';

const KEY = ['learning', 'vocab', 'overview'];

/** Dokun-çeviriden kaydedilen kelimeler: en yeni önce, sayfa sayfa. Bağlantıyla gelinirse (#my-words) bölüme kaydırılır. */
function SavedWords() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const q = useInfiniteQuery({
    queryKey: [...queryKeys.learning.vocabMyWords(), 'list'],
    queryFn: async ({ pageParam }) => (await api.learningVocabMyWords({ limit: 30, before: pageParam || undefined }))?.data?.data,
    initialPageParam: null,
    getNextPageParam: (last) => last?.nextBefore || undefined,
  });
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (scrolled || hash !== '#my-words' || !q.data) return;
    document.getElementById('my-words')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    setScrolled(true);
  }, [hash, q.data, scrolled]);
  const items = q.data?.pages.flatMap((p) => p?.items || []) || [];
  const total = q.data?.pages[0]?.total ?? 0;
  return (
    <section id="my-words" className="stack-sm" aria-labelledby="my-words-h" style={{ scrollMarginTop: 'var(--space-8)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 id="my-words-h" className="t-heading-2">{t('study.vocab.saved.title')}</h2>
        {total > 0 && <span className="t-caption muted tnum">{t('study.vocab.saved.count', { n: total })}</span>}
      </div>
      {q.isLoading ? <Skeleton height={120} />
        : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} />
          : !items.length ? <p className="t-body-m muted">{t('study.vocab.saved.empty')}</p>
            : (
              <>
                <p className="t-body-s muted">{t('study.vocab.saved.body')}</p>
                <Card>
                  <ul className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {items.map((w) => (
                      <li key={w.cardCode} className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                        <Link to={path(Routes.vocabWord, { id: w.itemCode })} className="t-body-m" style={{ minWidth: 0 }}>
                          <strong lang="en">{w.headword}</strong>{w.meaning ? <span className="muted"> — {w.meaning}</span> : null}
                        </Link>
                        {w.state === 'new' && <Chip size="sm">{t('study.vocab.saved.new')}</Chip>}
                      </li>
                    ))}
                  </ul>
                </Card>
                {q.hasNextPage && <div className="row"><Button variant="secondary" size="sm" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>{t('study.vocab.saved.more')}</Button></div>}
              </>
            )}
    </section>
  );
}

// STUDY-13: GET /vocab/overview; PUT /vocab/decks/{key}/subscription.
export default function Vocab() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useApiQuery(KEY, () => api.learningVocabOverviewGet());
  const sub = useApiMutation(({ key, ...body }) => api.learningVocabDeckSubscribe(key, body), { onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }) });
  if (q.isLoading) return <div className="stack"><Skeleton height={48} width="40%" /><Skeleton height={200} /></div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const { decks, totals, usage } = q.data;
  const canStart = totals.due > 0 || totals.newAvailableToday > 0;
  return (
    <div className="stack">
      <PageHeader title={t('study.vocab.title')} subtitle={t('study.vocab.subtitle')} />
      <Card tone="accent">
        <div className="stack-sm">
          <h2 className="t-heading-2">{t('study.vocab.due')}</h2>
          <p className="t-body-m">{totals.due > 0 ? t('study.vocab.dueLine', { n: totals.due }) : t('study.vocab.nothing')}</p>
          {totals.newAvailableToday > 0 && <p className="t-body-s muted">{t('study.vocab.newLine', { n: totals.newAvailableToday })}</p>}
          {usage?.limit != null && <p className="t-caption muted">{t('study.vocab.usage', { used: usage.used, limit: usage.limit })}</p>}
          <div className="row"><Button disabled={!canStart} onClick={() => nav(Routes.vocabReview)}>{t('study.vocab.start')}</Button></div>
        </div>
      </Card>
      <SavedWords />
      <section className="stack-sm">
        <h2 className="t-heading-2">{t('study.vocab.decks')}</h2>
        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {decks.map((d) => (
            <Card key={d.key} tone={d.locked ? 'locked' : 'default'}>
              <div className="stack-sm">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3 className="t-title">{d.name}</h3>
                  {d.locked ? <Chip size="sm" icon={<Lock size={12} />}>{t('study.vocab.locked')}</Chip> : d.subscribed && <Chip size="sm" tone="success">{t('study.vocab.subscribed')}</Chip>}
                </div>
                <p className="t-body-s muted">{d.description}</p>
                <p className="t-caption muted tnum">{t('study.vocab.words', { n: d.totalWords })} · {t('study.vocab.progress', { started: d.started, mature: d.mature, due: d.due })}</p>
                <ProgressBar value={d.totalWords ? (d.started / d.totalWords) * 100 : 0} size="sm" label={d.name} />
                {!d.locked && <p className="t-caption muted">{t('study.vocab.newPerDay', { n: d.newPerDay })}</p>}
                {!d.locked && (
                  <div className="row">
                    <Button size="sm" variant={d.subscribed ? 'tertiary' : 'secondary'} loading={sub.isPending && sub.variables?.key === d.key} onClick={() => sub.mutate({ key: d.key, isActive: !d.subscribed })}>{d.subscribed ? t('study.vocab.unsubscribe') : t('study.vocab.subscribe')}</Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
