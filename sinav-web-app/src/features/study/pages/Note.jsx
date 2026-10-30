import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bookmark, Lock } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Routes, { path } from '@shared/constant/route-paths';
import { notify } from '@shared/utils/notify';
import { queryClient } from '@shared/providers/QueryProvider';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import Banner from '@components/Banner/Banner';
import Markdown from '@components/Markdown/Markdown';
import TapText from '@features/lexicon/TapText';

const LEX_AUTO = { lang: 'auto' };
import IconButton from '@components/IconButton/IconButton';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';

// STUDY-04/05: hap not. İçerik content servisinden; okuma/anladım/kontrol soruları learning'den.
export default function Note() {
  const { id } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useApiQuery(['content', 'note', id], () => api.contentNoteGet(id));
  const done = (r) => {
    queryClient.invalidateQueries({ queryKey: ['learning'] });
    if (r.planTaskCompleted) notify(t('study.note.planDone'), 'success');
    else notify(t('study.note.readToast'), 'success');
    if (r.activity?.goalJustMet) notify(t('study.note.goalMet'), 'success');
  };
  const read = useApiMutation((understood) => api.learningNoteRead(id, understood), { onSuccess: (r) => { done(r); q.refetch(); } });
  const checks = useApiMutation(() => api.learningNoteCheckStart(id), { onSuccess: (r) => nav(path(Routes.session, { code: r.code })) });
  const bookmark = useApiMutation(() => api.learningBookmarkCreate({ itemCode: Number(id) }), { successMessage: 'study.note.savedToast' });

  if (q.isLoading) return <div className="stack"><Skeleton height={48} width="50%" /><Skeleton height={320} /></div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const n = q.data;
  const progress = read.data?.progress?.status;
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHeader
        back={<IconButton label={t('common.back')} onClick={() => nav(-1)}><ArrowLeft size={20} /></IconButton>}
        eyebrow={`${t('study.note.title')} · ${t('study.note.readSeconds', { n: n.readingSeconds })}`} title={n.title} subtitle={n.summary}
        actions={<Button variant="tertiary" startIcon={<Bookmark size={16} />} loading={bookmark.isPending} disabled={bookmark.isSuccess} onClick={() => bookmark.mutate()}>{bookmark.isSuccess ? t('study.note.bookmarked') : t('study.note.bookmark')}</Button>}
      />
      {n.locked ? (
        <Banner tone="warning" title={t('study.note.locked')} action={<Button size="sm" onClick={() => nav(Routes.premium)}>{t('study.note.upgrade')}</Button>}><Lock size={0} aria-hidden />{t('study.note.lockedBody')}</Banner>
      ) : (
        <>
          {n.ruleMd && <Card><div className="stack-sm"><h2 className="t-heading-3">{t('study.note.rule')}</h2><div className="reading t-reading-m"><Markdown source={n.ruleMd} lexicon={LEX_AUTO} /></div></div></Card>}
          {n.examples?.length > 0 && (
            <Card>
              <div className="stack-sm">
                <h2 className="t-heading-3">{t('study.note.examples')}</h2>
                {n.examples.map((e, i) => <div key={i}><p className="reading t-reading-m" lang="en"><TapText text={e.en} /></p><p className="muted t-body-s">{e.tr}</p></div>)}
              </div>
            </Card>
          )}
          {n.trapMd && <Card tone="reward"><div className="stack-sm"><h2 className="t-heading-3">{t('study.note.trap')}</h2><div className="reading t-reading-m"><Markdown source={n.trapMd} lexicon={LEX_AUTO} /></div></div></Card>}
          {n.relatedSkills?.length > 0 && (
            <div className="stack-sm">
              <p className="t-label-m">{t('study.note.related')}</p>
              <div className="row" style={{ flexWrap: 'wrap' }}>{n.relatedSkills.map((s) => <Chip key={s.key} onClick={() => nav(path(Routes.studySkill, { key: s.key }))}>{s.name}</Chip>)}</div>
            </div>
          )}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button variant="secondary" loading={read.isPending && read.variables === false} disabled={!!progress} onClick={() => read.mutate(false)}>{progress ? t(`study.note.status.${progress}`) : t('study.note.markRead')}</Button>
            {n.checkQuestions?.length > 0 && <Button loading={checks.isPending} onClick={() => checks.mutate()}>{t('study.note.checks')}</Button>}
            {!n.checkQuestions?.length && <Button loading={read.isPending && read.variables === true} disabled={progress === 'understood'} onClick={() => read.mutate(true)}>{t('study.note.understood')}</Button>}
          </div>
        </>
      )}
    </div>
  );
}
