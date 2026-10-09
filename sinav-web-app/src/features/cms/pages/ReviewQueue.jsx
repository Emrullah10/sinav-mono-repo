import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Select from '@components/Select/Select';
import Chip from '@components/Chip/Chip';
import Skeleton from '@components/Skeleton/Skeleton';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import ReviewDetail from '../components/ReviewDetail';
import Pager from '../components/Pager';
import s from '../components/Cms.module.scss';

const waiting = (sec, t) => (sec >= 3600 ? t('cmsx.review.hours', { n: Math.floor(sec / 3600) }) : t('cmsx.review.minutes', { n: Math.max(1, Math.floor(sec / 60)) }));

// CMS-06: inceleme kuyruğu. GET /cms/review-queue + seçili revizyon paneli.
export default function ReviewQueue() {
  const { t } = useTranslation();
  const { code } = useParams();
  const nav = useNavigate();
  const [assigned, setAssigned] = useState('all');
  const [page, setPage] = useState(1);
  const params = { assigned, page, pageSize: 20 };
  const { data, isLoading, error, refetch } = useApiQuery(['content', 'cms', 'reviewQueue', params], () => api.contentCmsReviewQueueList(params));
  return (
    <div className={s.page} style={{ maxWidth: 1400 }}>
      <PageHeader title={t('cmsx.review.title')} subtitle={t('cmsx.review.subtitle')} />
      <div className={s.split}>
        <div className="stack-sm">
          <Select label={t('cmsx.review.assigned')} value={assigned} onChange={(e) => { setAssigned(e.target.value); setPage(1); }}
            options={['all', 'me', 'mine_only', 'unassigned'].map((v) => ({ value: v, label: t(`cmsx.review.a.${v}`) }))} />
          {isLoading && <Skeleton height={200} />}
          {error && <ErrorState error={error} onRetry={refetch} />}
          {data?.items.length === 0 && <EmptyState title={t('cmsx.review.emptyTitle')} body={t('cmsx.review.emptyBody')} />}
          {data?.items.map((q) => (
            <Link key={q.revisionCode} to={path(Routes.cmsReviewItem, { code: q.revisionCode })} className={`${s.queueItem} ${String(q.revisionCode) === code ? s.on : ''}`}>
              <div className="row"><strong className="grow">#{q.itemCode} · v{q.revisionNo}</strong><Chip size="sm" tone={q.isUpdate ? 'warning' : 'accent'}>{q.isUpdate ? t('cmsx.review.update') : t('cmsx.review.newItem')}</Chip></div>
              <p className="t-body-s">{q.title || q.preview}</p>
              <p className="muted t-caption">{t(`cmsx.kind.${q.kind}`, { defaultValue: q.kind })} · {q.author?.displayName} · {waiting(q.waitingSeconds, t)}{q.openReports ? ` · ${t('cmsx.review.reports', { n: q.openReports })}` : ''}</p>
            </Link>
          ))}
          {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
        </div>
        <div>{code ? <ReviewDetail key={code} code={code} onDecided={() => nav(Routes.cmsReview)} /> : <EmptyState title={t('cmsx.review.pickTitle')} body={t('cmsx.review.pickBody')} />}</div>
      </div>
    </div>
  );
}
