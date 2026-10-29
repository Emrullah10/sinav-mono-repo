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
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Select from '@components/Select/Select';
import TextInput from '@components/TextInput/TextInput';
import Banner from '@components/Banner/Banner';
import Skeleton from '@components/Skeleton/Skeleton';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import Chip from '@components/Chip/Chip';
import StatusChip from '../components/StatusChip';
import Pager from '../components/Pager';
import useTaxonomy from '../hooks/useTaxonomy';
import s from '../components/Cms.module.scss';

// Cevap anahtarı denetimi: renk tek başına anlam taşımaz, metin her zaman yazılır.
function AiCheckChip({ check }) {
  const { t } = useTranslation();
  if (!check?.status) return null;
  const tone = check.status === 'agree' ? 'success' : check.status === 'mismatch' ? 'danger' : 'default';
  return <Chip size="sm" tone={tone}>{t(`cmsx.ai.check.${check.status}`, { n: check.mismatches?.length || 0 })}</Chip>;
}

function JobCard({ job }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const detail = useApiQuery(['content', 'cms', 'job', job.code], () => api.contentCmsGenerationJobGet(job.code), { enabled: open, refetchInterval: open && ['queued', 'running'].includes(job.status) ? 5000 : false });
  const refresh = () => qc.invalidateQueries({ queryKey: ['content', 'cms'] });
  const cancel = useApiMutation(() => api.contentCmsGenerationJobCancel(job.code), { onSuccess: refresh });
  const accept = useApiMutation((itemCode) => api.contentCmsDraftAccept(job.code, itemCode), { successMessage: 'cmsx.ai.accepted', onSuccess: refresh });
  const reject = useApiMutation((itemCode) => api.contentCmsDraftReject(job.code, itemCode, {}), { onSuccess: refresh });
  const drafts = detail.data?.drafts || [];
  return (
    <Card>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <strong className="grow">#{job.code} · {job.params?.questionTypeName || job.params?.questionTypeKey}</strong>
        <StatusChip status={job.status} />
        <span className="muted t-caption tnum">{dayjs(job.createdAt).format('D MMM YYYY HH:mm')}</span>
      </div>
      <p className="muted t-body-s tnum">{t('cmsx.ai.progress', { done: job.producedCount, total: job.requestedCount, failed: job.failedCount })} · {job.requestedBy?.displayName}</p>
      {job.error && <Banner tone="error">{job.error}</Banner>}
      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>{open ? t('cmsx.ai.hide') : t('cmsx.ai.drafts')}</Button>
        {['queued', 'running'].includes(job.status) && <Button size="sm" variant="tertiary" loading={cancel.isPending} onClick={() => cancel.mutate()}>{t('cmsx.ai.cancel')}</Button>}
      </div>
      {open && (
        <div className="stack-sm" style={{ marginTop: 'var(--space-3)' }}>
          {detail.isLoading && <Skeleton height={60} />}
          {detail.error && <ErrorState error={detail.error} onRetry={detail.refetch} />}
          {detail.data && drafts.length === 0 && <p className="muted t-body-s">{t('cmsx.ai.noDrafts')}</p>}
          {drafts.map((d) => {
            const ic = d.itemCode ?? d.code;
            return (
              <div key={ic} className={s.opt} style={{ gridTemplateColumns: '1fr auto' }}>
                <div>
                  <Link className={s.link} to={path(Routes.cmsItem, { code: ic })}>#{ic}</Link> <StatusChip status={d.status} /> <AiCheckChip check={d.aiCheck} />
                  <p className="t-body-s">{d.title || d.stem}</p>
                </div>
                {d.status === 'draft' && (
                  <div className="row">
                    <Button size="sm" onClick={() => accept.mutate(ic)}>{t('cmsx.ai.accept')}</Button>
                    <Button size="sm" variant="tertiary" onClick={() => reject.mutate(ic)}>{t('cmsx.ai.reject')}</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// CMS-05: yapay zekâ taslak üretici. POST/GET /cms/generation-jobs…
export default function AiJobs() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tax = useTaxonomy();
  const [f, setF] = useState({ kind: 'question', questionTypeKey: '', noteKind: 'skill', passageKind: 'reading', paragraphType: 'paragraph_completion', skillKey: '', subjectAreaKey: '', count: 5, difficulty: 3, topic: '', instructions: '' });
  const [page, setPage] = useState(1);
  const params = { page };
  const { data, isLoading, error, refetch } = useApiQuery(['content', 'cms', 'jobs', params], () => api.contentCmsGenerationJobsList(params), { refetchInterval: 15000 });
  const create = useApiMutation((p) => api.contentCmsGenerationJobCreate(p), { successMessage: 'cmsx.ai.created', onSuccess: () => qc.invalidateQueries({ queryKey: ['content', 'cms', 'jobs'] }) });
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const submit = (e) => {
    e.preventDefault();
    const kindFields = f.kind === 'note' ? { noteKind: f.noteKind, skillKeys: [f.skillKey] }
      : f.kind === 'passage' ? { passageKind: f.passageKind, skillKeys: [f.skillKey], ...(f.passageKind === 'paragraph' && { questionTypeKey: f.paragraphType }), ...(f.subjectAreaKey && { subjectAreaKey: f.subjectAreaKey }) }
        : { questionTypeKey: f.questionTypeKey };
    create.mutate({ kind: f.kind, ...kindFields, count: Number(f.count), difficulty: Number(f.difficulty), ...(f.topic.trim() && { topic: f.topic.trim() }), ...(f.instructions.trim() && { instructions: f.instructions.trim() }) });
  };
  const max = f.kind === 'question' ? 60 : 10;
  const ready = f.count >= 1 && f.count <= max && (f.kind === 'question' ? !!f.questionTypeKey : !!f.skillKey);
  const pick = (key, list) => list.map((v) => ({ value: v, label: t(`cmsx.ai.${key}.${v}`) }));
  return (
    <div className={s.page}>
      <PageHeader title={t('cmsx.ai.title')} subtitle={t('cmsx.ai.subtitle')} />
      <Card>
        <form className="stack" onSubmit={submit}>
          <div className={s.grid2}>
            <Select label={t('cmsx.ai.kind')} value={f.kind} onChange={(e) => set({ kind: e.target.value, count: e.target.value === 'question' ? 5 : 1 })} options={pick('kind', ['question', 'note', 'passage'])} />
            {f.kind === 'question' && <Select label={t('cmsx.q.type')} value={f.questionTypeKey} onChange={(e) => set({ questionTypeKey: e.target.value })} options={[{ value: '', label: t('cmsx.select') }, ...(tax.data?.questionTypes || []).map((q) => ({ value: q.key, label: q.name }))]} />}
            {f.kind === 'note' && <Select label={t('cmsx.ai.noteKind')} value={f.noteKind} onChange={(e) => set({ noteKind: e.target.value })} options={pick('noteKind', ['skill', 'strategy'])} />}
            {f.kind === 'passage' && <Select label={t('cmsx.ai.passageKind')} value={f.passageKind} onChange={(e) => set({ passageKind: e.target.value })} options={pick('passageKind', ['reading', 'cloze', 'paragraph'])} />}
            {f.kind === 'passage' && f.passageKind === 'paragraph' && <Select label={t('cmsx.ai.paragraphType')} value={f.paragraphType} onChange={(e) => set({ paragraphType: e.target.value })} options={pick('paragraphType', ['paragraph_completion', 'irrelevant_sentence'])} />}
            {f.kind !== 'question' && <Select label={t('cmsx.ai.skill')} value={f.skillKey} onChange={(e) => set({ skillKey: e.target.value })} options={[{ value: '', label: t('cmsx.select') }, ...(tax.data?.skills || []).map((x) => ({ value: x.key, label: `${'· '.repeat(x.depth)}${x.name}` }))]} />}
            {f.kind === 'passage' && <Select label={t('cmsx.ai.area')} value={f.subjectAreaKey} onChange={(e) => set({ subjectAreaKey: e.target.value })} options={[{ value: '', label: t('cmsx.select') }, ...(tax.data?.subjectAreas || []).map((a) => ({ value: a.key, label: a.name }))]} />}
            <TextInput label={t('cmsx.ai.max', { max })} type="number" min={1} max={max} value={f.count} onChange={(e) => set({ count: e.target.value })} />
            <Select label={t('cmsx.q.difficulty')} value={f.difficulty} onChange={(e) => set({ difficulty: e.target.value })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
            <TextInput label={t('cmsx.ai.topic')} value={f.topic} onChange={(e) => set({ topic: e.target.value })} />
          </div>
          <TextInput label={t('cmsx.ai.instructions')} multiline rows={3} value={f.instructions} onChange={(e) => set({ instructions: e.target.value })} />
          <div><Button type="submit" loading={create.isPending} disabled={!ready}>{t('cmsx.ai.create')}</Button></div>
        </form>
      </Card>
      {isLoading && <Skeleton height={160} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data?.items.length === 0 && <EmptyState title={t('cmsx.ai.emptyTitle')} body={t('cmsx.ai.emptyBody')} />}
      {data?.items.map((j) => <JobCard key={j.code} job={j} />)}
      {data && data.total > data.pageSize && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
    </div>
  );
}
