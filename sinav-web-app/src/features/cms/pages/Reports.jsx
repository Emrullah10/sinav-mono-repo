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

function ResolveModal({ report, onClose, onSubmit, pending, showNotify = true }) {
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
        {showNotify && <label className="row t-body-s"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t('cmsx.reports.notify')}</label>}
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

const senderOf = (t, f) => {
  if (!f.sender) return t('cmsx.feedback.anonymous');
  if (f.sender.isGuest) return `${t('cmsx.feedback.guest')} #${f.sender.code}`;
  return f.sender.displayName ? `${f.sender.displayName} · ${f.sender.email || ''}` : f.sender.email || `#${f.sender.code}`;
};
const deviceOf = (c = {}) => [c.model, c.os, c.viewport, c.userAgent && !c.model ? String(c.userAgent).slice(0, 90) : null].filter(Boolean).join(' · ');

// Uygulama içi geri bildirimler (identity): metin + fotoğraf/ekran görüntüsü + sesli kayıt.
function FeedbackReports() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState(FILTERS[0]);
  const [kind, setKind] = useState('');
  const [platform, setPlatform] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState(null);
  const params = { status, page, pageSize: 20, ...(kind && { kind }), ...(platform && { platform }) };
  const { data, isLoading, error, refetch } = useApiQuery(['identity', 'cms', 'feedback', params], () => api.identityCmsFeedbackList(params));
  const update = useApiMutation(({ code, status: st, note }) => api.identityCmsFeedbackUpdate(code, { status: st, ...(note && { note }) }), {
    successMessage: 'cmsx.reports.done', onSuccess: () => { setTarget(null); qc.invalidateQueries({ queryKey: ['identity', 'cms', 'feedback'] }); },
  });
  const all = { value: '', label: t('cmsx.feedback.all') };
  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <Select label={t('cmsx.col.status')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={FILTERS.map((v) => ({ value: v, label: t(`cmsx.reports.f.${v.replace(',', '_')}`) }))} className={s.filter} />
        <Select label={t('cmsx.feedback.kind')} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} options={[all, ...['bug', 'suggestion', 'other'].map((v) => ({ value: v, label: t(`feedback.kind.${v}`) }))]} className={s.filter} />
        <Select label={t('cmsx.feedback.platform')} value={platform} onChange={(e) => { setPlatform(e.target.value); setPage(1); }} options={[all, ...['ios', 'android', 'web'].map((v) => ({ value: v, label: v }))]} className={s.filter} />
      </div>
      {isLoading && <Skeleton height={240} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data?.items.length === 0 && <EmptyState title={t('cmsx.feedback.emptyTitle')} body={t('cmsx.feedback.emptyBody')} />}
      {data?.items.map((f) => (
        <Card key={f.code}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <strong className="grow">{t(`feedback.kind.${f.kind}`, { defaultValue: f.kind })} · #{f.code}</strong>
            <StatusChip status={f.status} />
            <span className="muted t-caption tnum">{dayjs(f.createdAt).format('D MMM YYYY HH:mm')}</span>
          </div>
          <p className="t-body-m" style={{ margin: 'var(--space-2) 0', whiteSpace: 'pre-wrap' }}>{f.message || <span className="muted">{t('cmsx.feedback.noText')}</span>}</p>
          <p className="muted t-body-s">
            {senderOf(t, f)} · {f.platform}{f.appVersion ? ` ${f.appVersion}` : ''}{f.screen ? <> · {t('cmsx.feedback.screen')}: <code>{f.screen}</code></> : null}
          </p>
          {deviceOf(f.context) && <p className="muted t-caption">{t('cmsx.feedback.device')}: {deviceOf(f.context)}</p>}
          {f.attachments.length > 0 && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-3)', alignItems: 'center' }}>
              {f.attachments.map((a) => {
                const src = api.identityCmsFeedbackAttachmentUrl(f.code, a.index);
                return a.kind === 'audio'
                  ? <audio key={a.index} controls preload="none" src={src} style={{ maxWidth: '100%' }} />
                  : <a key={a.index} href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt={t('cmsx.feedback.photo', { n: a.index + 1 })} loading="lazy" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-default)' }} /></a>;
              })}
            </div>
          )}
          {f.resolutionNote && <p className="muted t-body-s">{t('cmsx.note')}: {f.resolutionNote}</p>}
          {(f.status === 'open' || f.status === 'in_review') && <div style={{ marginTop: 'var(--space-3)' }}><Button size="sm" variant="secondary" onClick={() => setTarget(f)}>{t('cmsx.feedback.update')}</Button></div>}
        </Card>
      ))}
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      <ResolveModal key={target?.code} report={target} showNotify={false} onClose={() => setTarget(null)} pending={update.isPending} onSubmit={(b) => update.mutate({ code: target.code, ...b })} />
    </div>
  );
}

// CMS-08: hata bildirimleri (içerik + öğretmen yanıtı) ve uygulama içi geri bildirimler.
export default function Reports() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('content');
  return (
    <div className={s.page}>
      <PageHeader title={t('cmsx.reports.title')} subtitle={t('cmsx.reports.subtitle')} />
      <Tabs label={t('cmsx.reports.title')} value={tab} onChange={setTab} tabs={[{ value: 'content', label: t('cmsx.reports.tabContent') }, { value: 'tutor', label: t('cmsx.reports.tabTutor') }, { value: 'feedback', label: t('cmsx.reports.tabFeedback') }]} />
      {tab === 'content' && <ContentReports />}
      {tab === 'tutor' && <TutorReports />}
      {tab === 'feedback' && <FeedbackReports />}
    </div>
  );
}
