import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Tabs from '@components/Tabs/Tabs';
import Select from '@components/Select/Select';
import Button from '@components/Button/Button';
import Modal from '@components/Modal/Modal';
import TextInput from '@components/TextInput/TextInput';
import Card from '@components/Card/Card';
import Skeleton from '@components/Skeleton/Skeleton';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import StatusChip from '../components/StatusChip';
import Pager from '../components/Pager';
import s from '../components/Cms.module.scss';

const FILTERS = ['open,in_review', 'open', 'in_review', 'resolved', 'rejected'];

function ResolveModal({ report, onClose, onSubmit, pending }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('resolved');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  if (!report) return null;
  const needsNote = status !== 'in_review';
  return (
    <Modal open onClose={onClose} title={t('cmsx.reports.resolveTitle', { code: report.code })}
      footer={<><Button variant="tertiary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={pending} disabled={needsNote && !note.trim()} onClick={() => onSubmit({ status, note: note.trim() || undefined, notify })}>{t('common.save')}</Button></>}>
      <div className="stack-sm">
        <Select label={t('cmsx.col.status')} value={status} onChange={(e) => setStatus(e.target.value)} options={['resolved', 'rejected', 'in_review'].map((v) => ({ value: v, label: t(`cmsx.status.${v}`) }))} />
        <TextInput label={t('cmsx.note')} multiline rows={3} value={note} onChange={(e) => setNote(e.target.value)} helper={needsNote ? t('cmsx.review.noteRequired') : undefined} />
        <label className="row t-body-s"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t('cmsx.reports.notify')}</label>
      </div>
    </Modal>
  );
}

function ContentReports() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState(FILTERS[0]);
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState(null);
  const params = { status, page, pageSize: 20 };
  const { data, isLoading, error, refetch } = useApiQuery(['content', 'cms', 'reports', params], () => api.contentCmsReportsList(params));
  const resolve = useApiMutation(({ code, ...body }) => api.contentCmsReportResolve(code, body), {
    successMessage: 'cmsx.reports.done', onSuccess: () => { setTarget(null); qc.invalidateQueries({ queryKey: ['content', 'cms', 'reports'] }); },
  });
  return (
    <div className="stack">
      <Select label={t('cmsx.col.status')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={FILTERS.map((v) => ({ value: v, label: t(`cmsx.reports.f.${v.replace(',', '_')}`) }))} className={s.filter} />
      {isLoading && <Skeleton height={240} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data?.items.length === 0 && <EmptyState title={t('cmsx.reports.emptyTitle')} body={t('cmsx.reports.emptyBody')} />}
      {data?.items.map((r) => (
        <Card key={r.code}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <strong className="grow">{t(`enums.report_reason.${r.reason}`, { defaultValue: r.reason })}</strong>
            <StatusChip status={r.status} />
            <span className="muted t-caption tnum">{dayjs(r.createdAt).format('D MMM YYYY HH:mm')}</span>
          </div>
          <p className="t-body-m" style={{ margin: 'var(--space-2) 0' }}>{r.item.title || r.item.preview}</p>
          <p className="muted t-body-s">
            <Link className={s.link} to={path(Routes.cmsItem, { code: r.item.code })}>#{r.item.code}</Link> · {t('cmsx.reports.openCount', { n: r.item.openReportCount })} · {r.reporter?.displayName || '—'}
          </p>
          {r.note && <p className="t-body-s">“{r.note}”</p>}
          {r.resolutionNote && <p className="muted t-body-s">{t('cmsx.note')}: {r.resolutionNote}</p>}
          {(r.status === 'open' || r.status === 'in_review') && <div style={{ marginTop: 'var(--space-3)' }}><Button size="sm" variant="secondary" onClick={() => setTarget(r)}>{t('cmsx.reports.resolve')}</Button></div>}
        </Card>
      ))}
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      <ResolveModal key={target?.code} report={target} onClose={() => setTarget(null)} pending={resolve.isPending} onSubmit={(b) => resolve.mutate({ code: target.code, ...b })} />
    </div>
  );
}

function TutorReports() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [target, setTarget] = useState(null);
  const params = { limit: 50, ...(status && { status }) };
  const { data, isLoading, error, refetch } = useApiQuery(['tutor', 'cmsReports', params], () => api.tutorCmsReportsList(params));
  const resolve = useApiMutation(({ code, status: st, note }) => api.tutorCmsReportResolve(code, { status: st, ...(note && { note }) }), {
    successMessage: 'cmsx.reports.done', onSuccess: () => { setTarget(null); qc.invalidateQueries({ queryKey: ['tutor', 'cmsReports'] }); },
  });
  return (
    <div className="stack">
      <Select label={t('cmsx.col.status')} value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: t('cmsx.list.all') }, ...['open', 'in_review', 'resolved', 'rejected'].map((v) => ({ value: v, label: t(`cmsx.status.${v}`) }))]} className={s.filter} />
      {isLoading && <Skeleton height={240} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data?.reports.length === 0 && <EmptyState title={t('cmsx.reports.emptyTitle')} body={t('cmsx.reports.emptyBody')} />}
      {data?.reports.map((r) => (
        <Card key={r.code}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <strong className="grow">{t(`enums.report_reason.${r.reason}`, { defaultValue: r.reason })}</strong>
            <StatusChip status={r.status} />
            <span className="muted t-caption tnum">{dayjs(r.createdAt).format('D MMM YYYY HH:mm')}</span>
          </div>
          {r.note && <p className="t-body-s">“{r.note}”</p>}
          <div className={s.grid2} style={{ marginTop: 'var(--space-2)' }}>
            <div><p className="muted t-caption">{t('cmsx.reports.userMessage')}</p><p className="t-body-s">{r.snapshot?.userMessage || '—'}</p></div>
            <div><p className="muted t-caption">{t('cmsx.reports.assistantMessage')}</p><p className="t-body-s">{r.snapshot?.assistantMessage || '—'}</p></div>
          </div>
          {r.resolutionNote && <p className="muted t-body-s">{t('cmsx.note')}: {r.resolutionNote}</p>}
          {(r.status === 'open' || r.status === 'in_review') && <div style={{ marginTop: 'var(--space-3)' }}><Button size="sm" variant="secondary" onClick={() => setTarget(r)}>{t('cmsx.reports.resolve')}</Button></div>}
        </Card>
      ))}
      <ResolveModal key={target?.code} report={target} onClose={() => setTarget(null)} pending={resolve.isPending} onSubmit={(b) => resolve.mutate({ code: target.code, ...b })} />
    </div>
  );
}

// CMS-08: hata bildirimleri (içerik + öğretmen yanıtı).
export default function Reports() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('content');
  return (
    <div className={s.page}>
      <PageHeader title={t('cmsx.reports.title')} subtitle={t('cmsx.reports.subtitle')} />
      <Tabs label={t('cmsx.reports.title')} value={tab} onChange={setTab} tabs={[{ value: 'content', label: t('cmsx.reports.tabContent') }, { value: 'tutor', label: t('cmsx.reports.tabTutor') }]} />
      {tab === 'content' ? <ContentReports /> : <TutorReports />}
    </div>
  );
}
