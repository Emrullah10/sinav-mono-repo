import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Routes from '@shared/constant/route-paths';
import { queryClient } from '@shared/providers/QueryProvider';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import Tabs from '@components/Tabs/Tabs';
import Segmented from '@components/Segmented/Segmented';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import { formatDate } from '@features/home/hooks/useToday';

const PAGE_SIZE = 20;
const TYPES = ['knowledge_gap', 'attention', 'time', 'trap', 'vocabulary'];

// STUDY-17: GET /mistakes (süzgeç, sıra, sayfa); PATCH /mistakes/{code}.
export default function Mistakes() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [status, setStatus] = useState('open');
  const [typeKey, setTypeKey] = useState(null);
  const [dueOnly, setDueOnly] = useState(false);
  const [sort, setSort] = useState('due');
  const [page, setPage] = useState(1);
  const params = { status, sort, page, pageSize: PAGE_SIZE, ...(typeKey ? { typeKey } : {}), ...(dueOnly ? { due: true } : {}) };
  const q = useApiQuery(['learning', 'mistakes', params], () => api.learningMistakesList(params), { placeholderData: (prev) => prev });
  const update = useApiMutation(({ code, ...body }) => api.learningMistakeUpdate(code, body), {
    successMessage: 'study.mistakes.updated',
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['learning'] }),
  });
  if (q.isLoading) return <div className="stack"><Skeleton height={48} width="40%" /><Skeleton height={260} /></div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data;
  const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
  const tabs = ['open', 'resolved', 'archived'].map((s) => ({ value: s, label: t(`study.mistakes.status.${s}`), badge: d.counts[s] || undefined }));
  const fmt = (iso) => formatDate(iso, i18n.language, { day: 'numeric', month: 'long' });
  return (
    <div className="stack">
      <PageHeader title={t('study.mistakes.title')} subtitle={t('study.mistakes.subtitle')}
        actions={d.counts.due > 0 && <Button onClick={() => nav(Routes.mistakeReview)}>{t('study.mistakes.reviewDue')} ({d.counts.due})</Button>} />
      <Tabs label={t('study.mistakes.title')} tabs={tabs} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Chip selected={!typeKey} onClick={() => { setTypeKey(null); setPage(1); }}>{t('study.mistakes.allTypes')}</Chip>
        {d.byType.map((ty) => <Chip key={ty.key} selected={typeKey === ty.key} onClick={() => { setTypeKey(ty.key); setPage(1); }}>{ty.name} ({ty.n})</Chip>)}
        {status === 'open' && <Chip tone="warning" selected={dueOnly} onClick={() => { setDueOnly(!dueOnly); setPage(1); }}>{t('study.mistakes.dueOnly')}</Chip>}
        <span className="grow" />
        <Segmented label={t('study.mistakes.sort')} value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={['due', 'recent', 'wrong'].map((s) => ({ value: s, label: t(`study.mistakes.sort.${s}`) }))} />
      </div>
      {d.items.length === 0 ? <EmptyState title={t('study.mistakes.empty')} body={t('study.mistakes.emptyBody')} /> : (
        <div className="stack-sm">
          {d.items.map((m) => (
            <Card key={m.code}>
              <div className="stack-sm">
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span className="t-caption muted">{m.type?.name}</span>
                  <span className="row">
                    {m.isDue && m.status === 'open' && <Chip tone="warning" size="sm">{t('study.mistakes.dueNow')}</Chip>}
                    <span className="t-caption muted tnum">{t('study.mistakes.wrongCount', { n: m.wrongCount })} · {t('study.mistakes.streak', { n: m.correctStreak })}</span>
                  </span>
                </div>
                <p className="reading t-reading-m" lang="en">{m.stemPreview}</p>
                {m.status === 'open' && m.nextReviewAt && <p className="t-caption muted">{t('study.mistakes.next', { date: fmt(m.nextReviewAt) })}</p>}
                <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label={t('study.mistakes.typeLabel')}>
                  {TYPES.map((ty) => <Chip key={ty} size="sm" selected={m.mistakeType === ty} onClick={() => update.mutate({ code: m.code, mistakeType: m.mistakeType === ty ? null : ty })}>{t(`study.mistakeType.${ty}`)}</Chip>)}
                </div>
                <div className="row">
                  {m.status !== 'resolved' && <Button size="sm" variant="secondary" onClick={() => update.mutate({ code: m.code, status: 'resolved' })}>{t('study.mistakes.resolve')}</Button>}
                  {m.status !== 'open' && <Button size="sm" variant="secondary" onClick={() => update.mutate({ code: m.code, status: 'open' })}>{t('study.mistakes.reopen')}</Button>}
                  {m.status !== 'archived' && <Button size="sm" variant="tertiary" onClick={() => update.mutate({ code: m.code, status: 'archived' })}>{t('study.mistakes.archive')}</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <Button variant="tertiary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('study.mistakes.prev')}</Button>
          <span className="t-body-s muted">{t('study.mistakes.page', { page, pages })}</span>
          <Button variant="tertiary" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('study.mistakes.nextPage')}</Button>
        </div>
      )}
    </div>
  );
}
