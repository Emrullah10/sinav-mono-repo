import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Routes, { path } from '@shared/constant/route-paths';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import TextInput from '@components/TextInput/TextInput';
import Segmented from '@components/Segmented/Segmented';
import Banner from '@components/Banner/Banner';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import StatusChip from './StatusChip';
import s from './Cms.module.scss';

const show = (v) => (v == null ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

// CMS-06 sağ panel: sürüm farkı, yorumlar, karar (four-eyes).
export default function ReviewDetail({ code, onDecided }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const rev = useApiQuery(['content', 'cms', 'revision', code], () => api.contentCmsRevisionGet(code));
  const diff = useApiQuery(['content', 'cms', 'diff', code], () => api.contentCmsRevisionDiffGet(code));
  const comments = useApiQuery(['content', 'cms', 'comments', code], () => api.contentCmsCommentsList(code));
  const [decision, setDecision] = useState('approve');
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['content', 'cms'] });

  const addComment = useApiMutation((body) => api.contentCmsCommentCreate(code, { body }), { onSuccess: () => { setComment(''); refresh(); } });
  const resolve = useApiMutation((c) => api.contentCmsCommentResolve(c.code, { resolved: !c.resolved }), { onSuccess: refresh });
  const decide = useApiMutation((p) => api.contentCmsRevisionDecide(code, p), { successMessage: 'cmsx.review.decided', onSuccess: () => { setNote(''); refresh(); onDecided?.(); } });

  if (rev.isLoading) return <Skeleton height={360} />;
  if (rev.error) return <ErrorState error={rev.error} onRetry={rev.refetch} />;
  const { revision, item } = rev.data;
  const pending = revision.reviewStatus === 'submitted';
  const needsNote = decision !== 'approve';

  return (
    <div className="stack">
      <Card>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="grow">
            <p className="muted t-caption">#{item.code} · {t(`cmsx.kind.${item.kind}`, { defaultValue: item.kind })} · v{revision.revisionNo}</p>
            <h2 className="t-heading-2">{item.title || t('cmsx.item.untitled')}</h2>
          </div>
          <StatusChip status={revision.reviewStatus} />
          <Link className={s.link} to={path(Routes.cmsItem, { code: item.code })}>{t('cmsx.review.openItem')}</Link>
        </div>
        {revision.changeNote && <p className="muted t-body-s">{t('cmsx.item.changeNote')}: {revision.changeNote}</p>}
      </Card>

      <Card>
        <h3 className="t-heading-3">{t('cmsx.review.diff')}</h3>
        {diff.isLoading && <Skeleton height={80} />}
        {diff.error && <ErrorState error={diff.error} onRetry={diff.refetch} />}
        {diff.data && (
          <>
            {diff.data.isNew && <p className="muted t-body-s">{t('cmsx.review.isNew')}</p>}
            <div className={s.wrap} style={{ marginTop: 'var(--space-3)' }}>
              <table className={s.table}>
                <thead><tr><th>{t('cmsx.review.path')}</th><th>{t('cmsx.review.old')}</th><th>{t('cmsx.review.new')}</th></tr></thead>
                <tbody>
                  {diff.data.changes.filter((c) => c.path).map((c) => (
                    <tr key={c.path}>
                      <td className={s.mono}>{c.path}</td>
                      <td className={c.kind !== 'added' ? s.diffRemoved : undefined}><pre className={s.pre}>{c.kind === 'added' ? '—' : show(c.old)}</pre></td>
                      <td className={c.kind !== 'removed' ? s.diffAdded : undefined}><pre className={s.pre}>{c.kind === 'removed' ? '—' : show(c.new)}</pre></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card>
        <h3 className="t-heading-3">{t('cmsx.review.comments')}</h3>
        <div className="stack-sm" style={{ marginTop: 'var(--space-3)' }}>
          {comments.data?.items?.length === 0 && <p className="muted t-body-s">{t('cmsx.review.noComments')}</p>}
          {(comments.data?.items || []).map((c) => (
            <div key={c.code} className={s.opt} style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <p className="t-label-m">{c.author?.displayName || '—'} <span className="muted t-caption">{c.createdAt && dayjs(c.createdAt).format('D MMM HH:mm')}</span></p>
                <p className="t-body-m">{c.body}</p>
              </div>
              <Button size="sm" variant="tertiary" onClick={() => resolve.mutate(c)}>{c.resolved ? t('cmsx.review.reopen') : t('cmsx.review.resolve')}</Button>
            </div>
          ))}
          <TextInput label={t('cmsx.review.addComment')} multiline rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          <div><Button variant="secondary" size="sm" disabled={!comment.trim()} loading={addComment.isPending} onClick={() => addComment.mutate(comment.trim())}>{t('cmsx.review.saveComment')}</Button></div>
        </div>
      </Card>

      {pending ? (
        <Card>
          <h3 className="t-heading-3">{t('cmsx.review.decision')}</h3>
          <div className="stack-sm" style={{ marginTop: 'var(--space-3)' }}>
            <Segmented label={t('cmsx.review.decision')} value={decision} onChange={setDecision}
              options={['approve', 'request_changes', 'reject'].map((d) => ({ value: d, label: t(`cmsx.review.d.${d}`) }))} />
            <TextInput label={t('cmsx.note')} helper={needsNote ? t('cmsx.review.noteRequired') : undefined} multiline rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            <div><Button variant={decision === 'reject' ? 'destructive' : 'primary'} disabled={needsNote && !note.trim()} loading={decide.isPending} onClick={() => decide.mutate({ decision, ...(note.trim() && { note: note.trim() }) })}>{t('cmsx.review.send')}</Button></div>
          </div>
        </Card>
      ) : (
        <Banner tone="info">{t('cmsx.review.notPending')}{revision.decisionNote ? ` — ${revision.decisionNote}` : ''}</Banner>
      )}
    </div>
  );
}
