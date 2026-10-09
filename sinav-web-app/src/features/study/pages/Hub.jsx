import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layers, BookX, Shuffle } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Chip from '@components/Chip/Chip';
import Banner from '@components/Banner/Banner';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import MasteryBadge from '../components/MasteryBadge';
import usePracticeStart from '../hooks/usePracticeStart';
import styles from './Hub.module.scss';

// STUDY-01: GET /study/overview (+ yarım kalan oturumlar).
export default function Hub() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useApiQuery(['learning', 'study', 'overview'], () => api.learningStudyOverviewGet());
  const cur = useApiQuery(['learning', 'sessions', 'current'], () => api.learningSessionsCurrentList());
  const start = usePracticeStart();
  if (q.isLoading) return <div className="stack"><Skeleton height={48} width="40%" /><Skeleton height={160} /><Skeleton height={320} /></div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const { types, vocab, mistakes, recommendedTypeKey } = q.data;
  const open = (cur.data?.sessions || []).filter((s) => s.kind === 'practice' || s.kind === 'error_review' || s.kind === 'note_check');
  return (
    <div className="stack">
      <PageHeader title={t('study.hub.title')} subtitle={t('study.hub.subtitle')} actions={<Button variant="secondary" startIcon={<Shuffle size={16} />} onClick={() => nav(Routes.practiceSetup)}>{t('study.hub.practiceCta')}</Button>} />
      {open.length > 0 && (
        <Banner tone="accent" title={t('study.hub.openSessions')} action={<Button size="sm" onClick={() => nav(path(Routes.session, { code: open[0].code }))}>{t('study.hub.continue')}</Button>}>{t('study.hub.openSessionsBody')}</Banner>
      )}
      <section className="stack-sm" aria-labelledby="due-h">
        <h2 id="due-h" className="t-heading-2">{t('study.hub.due')}</h2>
        <div className={styles.due}>
          <Card>
            <div className="stack-sm">
              <h3 className="t-title row"><Layers size={18} aria-hidden /> {t('study.hub.vocabCard')}</h3>
              <p className="muted t-body-s">{vocab.dueCards ? t('study.hub.vocabBody', { n: vocab.dueCards }) : t('study.hub.vocabNone')}</p>
              <div className="row"><Button size="sm" onClick={() => nav(vocab.dueCards ? Routes.vocabReview : Routes.vocab)}>{vocab.dueCards ? t('study.vocab.start') : t('study.vocab.title')}</Button></div>
            </div>
          </Card>
          <Card>
            <div className="stack-sm">
              <h3 className="t-title row"><BookX size={18} aria-hidden /> {t('study.hub.mistakeCard')}</h3>
              <p className="muted t-body-s">{mistakes.due ? t('study.hub.mistakeBody', { n: mistakes.due, open: mistakes.open }) : t('study.hub.mistakeNone')}</p>
              <div className="row">
                <Button size="sm" onClick={() => nav(mistakes.due ? Routes.mistakeReview : Routes.mistakes)}>{mistakes.due ? t('study.mistakes.reviewDue') : t('study.mistakes.title')}</Button>
                {mistakes.due > 0 && <Button size="sm" variant="tertiary" onClick={() => nav(Routes.mistakes)}>{t('study.mistakes.title')}</Button>}
              </div>
            </div>
          </Card>
        </div>
      </section>
      <section className="stack-sm" aria-labelledby="types-h">
        <h2 id="types-h" className="t-heading-2">{t('study.hub.types')}</h2>
        {types.length === 0 ? <EmptyState title={t('study.hub.empty')} /> : (
          <div className={styles.types}>
            {types.map((ty) => (
              <Card key={ty.key} tone={ty.key === recommendedTypeKey ? 'accent' : 'default'}>
                <div className="stack-sm">
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <h3 className="t-title"><Link to={path(Routes.studyType, { type: ty.key })}>{ty.name}</Link></h3>
                    {ty.key === recommendedTypeKey && <Chip tone="accent" size="sm">{t('study.hub.recommended')}</Chip>}
                  </div>
                  <p className="t-caption muted">{t('study.hub.questionsInExam', { n: ty.questionCountInExam })}</p>
                  <MasteryBadge level={ty.level} mastery={ty.mastery} change7d={ty.change7d} label={ty.name} />
                  <div className="row">
                    <Button size="sm" loading={start.isPending && start.variables?.questionTypeKeys?.[0] === ty.key} onClick={() => start.mutate({ questionTypeKeys: [ty.key], count: 10 })}>{t('study.hub.solve')}</Button>
                    <Button size="sm" variant="tertiary" onClick={() => nav(path(Routes.studyType, { type: ty.key }))}>{t('study.hub.details')}</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
