import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Routes, { path } from '@shared/constant/route-paths';
import { useHasPermission } from '@shared/auth/permissions';
import { apiErrorDetails, getApiErrorMessage } from '@shared/utils/apiError';
import { notify } from '@shared/utils/notify';
import PageHeader from '@components/PageHeader/PageHeader';
import Button from '@components/Button/Button';
import Card from '@components/Card/Card';
import Banner from '@components/Banner/Banner';
import Modal from '@components/Modal/Modal';
import TextInput from '@components/TextInput/TextInput';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import BodyEditor from '../components/BodyEditor';
import StatusChip from '../components/StatusChip';
import { cleanQuestion } from '../components/QuestionForm';
import useTaxonomy from '../hooks/useTaxonomy';
import s from '../components/Cms.module.scss';

// CMS-02..04: madde ayrıntısı + taslak düzenleme, incelemeye gönderme, yeni revizyon, emekliye ayırma.
export default function ItemDetail() {
  const { t } = useTranslation();
  const { code } = useParams();
  const qc = useQueryClient();
  const canWrite = useHasPermission('content:write');
  const canReview = useHasPermission('content:review');
  const tax = useTaxonomy();
  const { data, isLoading, error, refetch } = useApiQuery(['content', 'cms', 'item', code], () => api.contentCmsItemGet(code));
  const rev = data?.latestRevision;
  const editable = !!rev?.editable && canWrite;
  const [body, setBody] = useState(null);
  const [jsonOk, setJsonOk] = useState(true);
  const [changeNote, setChangeNote] = useState('');
  const [retireOpen, setRetireOpen] = useState(false);
  const [retireNote, setRetireNote] = useState('');
  const [problems, setProblems] = useState(null);

  useEffect(() => { if (rev?.body) { setBody(rev.body); setJsonOk(true); } }, [rev?.code, rev?.updatedAt, rev?.body]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['content', 'cms'] }); };

  const save = useApiMutation((b) => api.contentCmsItemDraftSave(code, { body: b, ...(changeNote && { changeNote }) }), { successMessage: 'cmsx.item.saved', onSuccess: refresh });
  const submit = useApiMutation(() => api.contentCmsItemSubmit(code, { ...(changeNote && { changeNote }) }), {
    successMessage: 'cmsx.item.submitted',
    onSuccess: () => { setProblems(null); refresh(); },
    onError: (e) => { setProblems(apiErrorDetails(e)); notify(getApiErrorMessage(e), 'error'); },
  });
  const newRev = useApiMutation(() => api.contentCmsItemRevisionCreate(code, {}), { successMessage: 'cmsx.item.revisionOpened', onSuccess: refresh });
  const retire = useApiMutation(() => api.contentCmsItemRetire(code, { ...(retireNote && { note: retireNote }) }), { successMessage: 'cmsx.item.retired', onSuccess: () => { setRetireOpen(false); refresh(); } });

  if (isLoading) return <div className={s.page}><Skeleton height={400} /></div>;
  if (error) return <div className={s.page}><ErrorState error={error} onRetry={refetch} /></div>;
  const payload = () => (data.kind === 'question' ? cleanQuestion(body) : body);
  const busy = save.isPending || submit.isPending;
  const errs = problems?.errors || [];
  const warns = problems?.warnings || [];

  return (
    <div className={s.page}>
      <PageHeader
        eyebrow={`#${data.code} · ${t(`cmsx.kind.${data.kind}`, { defaultValue: data.kind })}`}
        title={data.title || t('cmsx.item.untitled')}
        subtitle={<span className="row"><StatusChip status={data.status} /><span className="muted t-body-s">{rev && `v${rev.revisionNo} · `}{dayjs(data.updatedAt).format('D MMM YYYY HH:mm')}</span></span>}
        actions={<>
          {canWrite && data.status === 'published' && !rev?.editable && rev?.reviewStatus !== 'submitted' && <Button variant="secondary" loading={newRev.isPending} onClick={() => newRev.mutate()}>{t('cmsx.item.newRevision')}</Button>}
          {(canWrite || canReview) && data.status !== 'retired' && <Button variant="destructive" onClick={() => setRetireOpen(true)}>{t('cmsx.item.retire')}</Button>}
        </>}
      />
      {data.status === 'retired' && <Banner tone="warning">{t('cmsx.item.retiredNote')}</Banner>}
      {rev?.reviewStatus === 'changes_requested' && rev.decisionNote && <Banner tone="warning" title={t('cmsx.item.changesRequested')}>{rev.decisionNote}</Banner>}

      <Card>
        <dl className={s.stats}>
          {[
            ['cmsx.col.tier', t(`enums.access_tier.${data.accessTier}`, { defaultValue: data.accessTier })],
            ['cmsx.new.language', data.language],
            ['cmsx.new.exam', (data.examKeys || []).join(', ') || '—'],
            ['cmsx.list.skill', (data.skills || []).map((x) => x.name).join(', ') || '—'],
            ['cmsx.col.revision', rev ? t(`cmsx.status.${rev.reviewStatus}`, { defaultValue: rev.reviewStatus }) : '—'],
            ['cmsx.item.author', rev?.author?.displayName || '—'],
          ].map(([k, v]) => <div key={k}><dt className="muted t-caption">{t(k)}</dt><dd style={{ margin: 0 }} className="t-title">{v}</dd></div>)}
        </dl>
      </Card>

      {body && (
        <Card>
          <div className="stack">
            <h2 className="t-heading-3">{t('cmsx.item.body')}</h2>
            {!editable && rev && <p className="muted t-body-s">{t('cmsx.item.readOnly')}</p>}
            <BodyEditor key={`${rev?.code}-${rev?.updatedAt}`} kind={data.kind} value={body} onChange={setBody} onValidity={setJsonOk} questionTypes={tax.data?.questionTypes} disabled={!editable} />
            {editable && (
              <>
      {errs.length > 0 && <Banner tone="error" title={t('cmsx.item.validationFailed')}><ul>{errs.map((e, i) => <li key={i}>{typeof e === 'string' ? e : e.message || JSON.stringify(e)}</li>)}</ul></Banner>}
      {warns.length > 0 && <Banner tone="warning" title={t('cmsx.item.warnings')}><ul>{warns.map((e, i) => <li key={i}>{typeof e === 'string' ? e : e.message || JSON.stringify(e)}</li>)}</ul></Banner>}
                <TextInput label={t('cmsx.item.changeNote')} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
                <div className="row">
                  <Button variant="secondary" disabled={!jsonOk} loading={save.isPending} onClick={() => save.mutate(payload())}>{t('cmsx.item.saveDraft')}</Button>
                  <Button disabled={!jsonOk || busy} loading={submit.isPending} onClick={() => save.mutateAsync(payload()).then(() => submit.mutate()).catch(() => {})}>{t('cmsx.item.submit')}</Button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {data.revisions?.length > 0 && (
        <Card>
          <h2 className="t-heading-3">{t('cmsx.item.revisions')}</h2>
          <div className={s.wrap} style={{ marginTop: 'var(--space-3)' }}>
            <table className={s.table}>
              <thead><tr><th>#</th><th>{t('cmsx.col.status')}</th><th>{t('cmsx.item.changeNote')}</th><th>{t('cmsx.col.updated')}</th></tr></thead>
              <tbody>
                {data.revisions.map((r) => (
                  <tr key={r.code}>
                    <td className="tnum">{canReview ? <Link className={s.link} to={path(Routes.cmsReviewItem, { code: r.code })}>v{r.revisionNo}</Link> : `v${r.revisionNo}`}</td>
                    <td><StatusChip status={r.reviewStatus} /></td>
                    <td>{r.changeNote || '—'}</td>
                    <td className="tnum">{r.updatedAt ? dayjs(r.updatedAt).format('D MMM YYYY HH:mm') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={retireOpen} onClose={() => setRetireOpen(false)} title={t('cmsx.item.retire')}
        footer={<><Button variant="tertiary" onClick={() => setRetireOpen(false)}>{t('common.cancel')}</Button><Button variant="destructive" loading={retire.isPending} onClick={() => retire.mutate()}>{t('cmsx.item.retireConfirm')}</Button></>}>
        <TextInput label={t('cmsx.note')} multiline rows={3} value={retireNote} onChange={(e) => setRetireNote(e.target.value)} />
      </Modal>
    </div>
  );
}
