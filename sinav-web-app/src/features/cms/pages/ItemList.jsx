import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Plus } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import { useHasPermission } from '@shared/auth/permissions';
import PageHeader from '@components/PageHeader/PageHeader';
import Button from '@components/Button/Button';
import TextInput from '@components/TextInput/TextInput';
import Select from '@components/Select/Select';
import Tabs from '@components/Tabs/Tabs';
import Skeleton from '@components/Skeleton/Skeleton';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import StatusChip from '../components/StatusChip';
import Pager from '../components/Pager';
import useTaxonomy from '../hooks/useTaxonomy';
import s from '../components/Cms.module.scss';

const STATUSES = ['draft', 'in_review', 'pilot', 'published', 'retired'];
const KINDS = ['question', 'passage', 'note', 'vocab_entry', 'translation_prompt', 'exam_form', 'article'];
const SORTS = ['updated_desc', 'updated_asc', 'created_desc', 'title', 'reports_desc', 'attempts_desc', 'correct_rate_asc', 'correct_rate_desc'];
const PAGE_SIZE = 25;

// CMS-01: içerik listesi. GET /cms/items
export default function ItemList() {
  const { t } = useTranslation();
  const canWrite = useHasPermission('content:write');
  const [f, setF] = useState({ q: '', kind: '', status: '', skill: '', sort: 'updated_desc', mine: false, page: 1 });
  const [draftQ, setDraftQ] = useState('');
  const tax = useTaxonomy();
  const params = { pageSize: PAGE_SIZE, page: f.page, sort: f.sort, ...(f.q && { q: f.q }), ...(f.kind && { kind: f.kind }), ...(f.status && { status: f.status }), ...(f.skill && { skill: f.skill }), ...(f.mine && { mine: true }) };
  const { data, isLoading, error, refetch } = useApiQuery(['content', 'cms', 'items', params], () => api.contentCmsItemsList(params), { placeholderData: (p) => p });
  const set = (patch) => setF((x) => ({ ...x, page: 1, ...patch }));
  const counts = data?.statusCounts || {};
  const tabs = [{ value: '', label: t('cmsx.list.all') }, ...STATUSES.map((st) => ({ value: st, label: t(`cmsx.status.${st}`), badge: counts[st] || undefined }))];

  return (
    <div className={s.page}>
      <PageHeader title={t('cmsx.list.title')} subtitle={t('cmsx.list.subtitle')}
        actions={canWrite && <Link to={Routes.cmsNew}><Button startIcon={<Plus size={18} />}>{t('cmsx.list.new')}</Button></Link>} />
      <Tabs label={t('cmsx.list.statusTabs')} tabs={tabs} value={f.status} onChange={(v) => set({ status: v })} />
      <form className={s.toolbar} onSubmit={(e) => { e.preventDefault(); set({ q: draftQ.trim() }); }}>
        <TextInput label={t('cmsx.list.search')} value={draftQ} onChange={(e) => setDraftQ(e.target.value)} style={{ minWidth: 260 }} />
        <Select label={t('cmsx.list.kind')} value={f.kind} onChange={(e) => set({ kind: e.target.value })}
          options={[{ value: '', label: t('cmsx.list.all') }, ...KINDS.map((k) => ({ value: k, label: t(`cmsx.kind.${k}`) }))]} />
        <Select label={t('cmsx.list.skill')} value={f.skill} onChange={(e) => set({ skill: e.target.value })}
          options={[{ value: '', label: t('cmsx.list.all') }, ...(tax.data?.skills || []).filter((x) => x.depth === 0).map((x) => ({ value: x.key, label: x.name }))]} />
        <Select label={t('cmsx.list.sort')} value={f.sort} onChange={(e) => set({ sort: e.target.value })} options={SORTS.map((k) => ({ value: k, label: t(`cmsx.sort.${k}`) }))} />
        <label className="row t-body-s" style={{ minHeight: 44 }}><input type="checkbox" checked={f.mine} onChange={(e) => set({ mine: e.target.checked })} /> {t('cmsx.list.mine')}</label>
        <Button type="submit" variant="secondary">{t('cmsx.list.filter')}</Button>
      </form>

      {isLoading && <Skeleton height={320} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data && data.items.length === 0 && <EmptyState title={t('cmsx.list.emptyTitle')} body={t('cmsx.list.emptyBody')} />}
      {data && data.items.length > 0 && (
        <>
          <div className={s.wrap}>
            <table className={s.table}>
              <thead><tr>
                <th>{t('cmsx.col.code')}</th><th>{t('cmsx.col.kind')}</th><th>{t('cmsx.col.title')}</th><th>{t('cmsx.col.status')}</th>
                <th>{t('cmsx.col.revision')}</th><th>{t('cmsx.col.tier')}</th><th>{t('cmsx.col.author')}</th><th>{t('cmsx.col.updated')}</th>
              </tr></thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.code}>
                    <td className="tnum"><Link className={s.link} to={path(Routes.cmsItem, { code: it.code })}>{it.code}</Link></td>
                    <td>{t(`cmsx.kind.${it.kind}`, { defaultValue: it.kind })}</td>
                    <td style={{ maxWidth: 420 }}>{it.title || it.preview}</td>
                    <td><StatusChip status={it.status} /></td>
                    <td className="tnum">{it.revision ? <>v{it.revision.revisionNo} <StatusChip status={it.revision.reviewStatus} /></> : '—'}</td>
                    <td>{t(`enums.access_tier.${it.accessTier}`, { defaultValue: it.accessTier })}</td>
                    <td>{it.updatedBy?.displayName || it.author?.displayName || '—'}</td>
                    <td className="tnum">{dayjs(it.updatedAt).format('D MMM YYYY HH:mm')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => setF((x) => ({ ...x, page: p }))} />
        </>
      )}
    </div>
  );
}
