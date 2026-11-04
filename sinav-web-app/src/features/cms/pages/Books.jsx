import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { useHasPermission } from '@shared/auth/permissions';
import { notify } from '@shared/utils/notify';
import { getApiErrorMessage } from '@shared/utils/apiError';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Modal from '@components/Modal/Modal';
import Select from '@components/Select/Select';
import TextInput from '@components/TextInput/TextInput';
import Skeleton from '@components/Skeleton/Skeleton';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import StatusChip from '../components/StatusChip';
import Pager from '../components/Pager';
import s from '../components/Cms.module.scss';

const LEVELS = ['A2', 'B1', 'B2', 'C1'];
const TOPICS = ['story', 'classic', 'academic', 'health', 'science', 'social'];
const EMPTY = { title: '', author: '', description: '', level: '', topic: '', license: '', attribution: '', sourceUrl: '', accessTier: 'free' };

function MetaFields({ form, set }) {
  const { t } = useTranslation();
  const field = (k) => ({ value: form[k] ?? '', onChange: (e) => set({ ...form, [k]: e.target.value }) });
  return (
    <>
      <TextInput label={t('cmsx.books.fieldTitle')} maxLength={300} {...field('title')} />
      <TextInput label={t('cmsx.books.author')} maxLength={200} {...field('author')} />
      <TextInput label={t('cmsx.books.description')} multiline rows={3} {...field('description')} />
      <Select label={t('cmsx.books.level')} {...field('level')} options={[{ value: '', label: '—' }, ...LEVELS.map((v) => ({ value: v, label: v }))]} />
      <Select label={t('cmsx.books.topic')} {...field('topic')} options={[{ value: '', label: '—' }, ...TOPICS.map((v) => ({ value: v, label: t(`enums.book_topic.${v}`) }))]} />
      <TextInput label={t('cmsx.books.license')} maxLength={120} {...field('license')} />
      <TextInput label={t('cmsx.books.attribution')} maxLength={300} {...field('attribution')} />
      <TextInput label={t('cmsx.books.sourceUrl')} maxLength={500} {...field('sourceUrl')} />
      <Select label={t('cmsx.books.tier')} {...field('accessTier')} options={[{ value: 'free', label: t('cmsx.books.tierFree') }, { value: 'premium', label: t('cmsx.books.tierPremium') }]} />
    </>
  );
}

// CMS: hazır kitaplar. Yükleme öğrenci PDF hattından geçer; yayımlanana kadar Kitaplık'ta görünmez.
export default function Books() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useHasPermission('content:write');
  const canReview = useHasPermission('content:review');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(null);
  const [file, setFile] = useState(null);
  const [editing, setEditing] = useState(null);
  const q = useApiQuery(['content', 'cms', 'books', page], () => api.contentCmsBooksList({ page, pageSize: 30 }), {
    refetchInterval: (query) => (query.state.data?.items?.some((b) => b.status === 'processing') ? 4000 : false),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['content', 'cms', 'books'] });
  const upload = useApiMutation(() => {
    const form = new FormData();
    form.append('file', file);
    for (const [k, v] of Object.entries(adding)) if (v) form.append(k, v);
    return api.contentCmsBookCreate(form);
  }, {
    successMessage: 'cmsx.books.uploaded',
    onSuccess: () => { setAdding(null); setFile(null); refresh(); },
    onError: (e) => notify(getApiErrorMessage(e), 'error'),
  });
  const save = useApiMutation((b) => api.contentCmsBookUpdate(b.code, b), { onSuccess: () => { setEditing(null); refresh(); } });
  const publish = useApiMutation(({ code, published }) => api.contentCmsBookPublish(code, published), { onSuccess: refresh });

  return (
    <div className="stack">
      <PageHeader title={t('cmsx.books.title')} subtitle={t('cmsx.books.subtitle')} actions={canWrite ? <Button onClick={() => setAdding({ ...EMPTY })}>{t('cmsx.books.new')}</Button> : undefined} />
      {q.isLoading ? <Skeleton height={320} /> : q.isError ? <ErrorState error={q.error} onRetry={q.refetch} /> : q.data.items.length === 0 ? <EmptyState title={t('cmsx.books.empty')} /> : (
        <Card padding="none">
          <div className={s.wrap}>
            <table className={s.table}>
              <thead>
                <tr><th>{t('cmsx.books.fieldTitle')}</th><th>{t('cmsx.books.level')}</th><th>{t('cmsx.books.topic')}</th><th>{t('cmsx.books.size')}</th><th>{t('cmsx.books.status')}</th><th>{t('cmsx.books.published')}</th><th aria-label={t('cmsx.books.edit')} /></tr>
              </thead>
              <tbody>
                {q.data.items.map((b) => (
                  <tr key={b.code}>
                    <td><strong>{b.title}</strong>{b.author && <div className="muted t-caption">{b.author}</div>}</td>
                    <td>{b.level || '—'}</td>
                    <td>{b.topic ? t(`enums.book_topic.${b.topic}`) : '—'}</td>
                    <td className="tnum">{`${b.pageCount || '—'} / ${b.wordCount.toLocaleString('tr-TR')}`}</td>
                    <td><StatusChip status={b.status} />{b.errorCode && <div className="muted t-caption">{t(`apiErrors.${b.errorCode}`)}</div>}</td>
                    <td>{b.publishedAt ? t('cmsx.books.published') : t('cmsx.books.notPublished')}</td>
                    <td>
                      <div className="row">
                        {canWrite && <Button size="sm" variant="tertiary" onClick={() => setEditing({ code: b.code, title: b.title, author: b.author, description: b.description, level: b.level, topic: b.topic, license: b.license, attribution: b.attribution, sourceUrl: b.sourceUrl, accessTier: b.accessTier })}>{t('cmsx.books.edit')}</Button>}
                        {canReview && <Button size="sm" variant="secondary" disabled={b.status !== 'ready' && !b.publishedAt} loading={publish.isPending && publish.variables?.code === b.code} onClick={() => publish.mutate({ code: b.code, published: !b.publishedAt })}>{b.publishedAt ? t('cmsx.books.unpublish') : t('cmsx.books.publish')}</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </Card>
      )}
      <Modal open={!!adding} onClose={() => setAdding(null)} title={t('cmsx.books.new')} footer={<Button loading={upload.isPending} disabled={!file || !adding?.title?.trim()} onClick={() => upload.mutate()}>{t('cmsx.books.upload')}</Button>}>
        {adding && (
          <div className="stack-sm">
            <label className="stack-sm"><span className="t-label-m">{t('cmsx.books.file')}</span><input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
            <MetaFields form={adding} set={setAdding} />
          </div>
        )}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('cmsx.books.edit')} footer={<Button loading={save.isPending} disabled={!editing?.title?.trim()} onClick={() => save.mutate(editing)}>{t('cmsx.books.save')}</Button>}>
        {editing && <div className="stack-sm"><MetaFields form={editing} set={setEditing} /></div>}
      </Modal>
    </div>
  );
}
