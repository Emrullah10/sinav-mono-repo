import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { apiErrorCode } from '@shared/utils/apiError';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import styles from './Result.module.scss';

// EXAM-11: ayrıntılı analiz (Premium). GET /exam-sittings/{code}/analysis; "Plana ekle" = POST /plan/adjust
export default function Analysis() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { code } = useParams();
  const { data: a, isLoading, isError, error, refetch } = useApiQuery(['exam', 'analysis', code], () => api.learningExamAnalysisGet(code), { retry: false });
  const add = useApiMutation((body) => api.learningPlanAdjust(body), { successMessage: 'exam.analysis.added' });
  const back = <Button variant="tertiary" onClick={() => nav(path(Routes.examResult, { code }))}>{t('exam.analysis.back')}</Button>;

  if (isError && apiErrorCode(error) === 'FEATURE_LOCKED') {
    return <div className={styles.page}><EmptyState icon={<Lock size={32} />} title={t('exam.analysis.lockedTitle')} body={t('exam.analysis.lockedBody')} action={<div className="stack-sm"><Button onClick={() => nav(Routes.plans)}>{t('exam.unlock')}</Button>{back}</div>} /></div>;
  }
  if (isError) return <div className={styles.page}><ErrorState error={error} onRetry={refetch} />{back}</div>;
  if (isLoading || !a) return <div className={styles.page}><Skeleton height={300} radius={16} /></div>;

  return (
    <div className={styles.page}>
      <PageHeader title={t('exam.analysis.title')} subtitle={a.title} actions={back} />
      {a.potentialExtraCorrect > 0 && <Card tone="reward"><p className="t-title">{t('exam.analysis.potential', { n: a.potentialExtraCorrect })}</p></Card>}
      <div className={styles.two}>
        <Card className="stack-sm">
          <h2 className="t-heading-3">{t('exam.analysis.habits')}</h2>
          <p className="t-body-m tnum">{t('exam.analysis.rushed', { n: a.habits.rushedWrongCount })}</p>
          <p className="t-body-m tnum">{t('exam.analysis.slow', { n: a.habits.slowCorrectCount })}</p>
          <p className="t-body-m tnum">{t('exam.analysis.blankRate', { n: Math.round((a.habits.blankRate ?? 0) * 100) })}</p>
        </Card>
        <Card className="stack-sm">
          <h2 className="t-heading-3">{t('exam.analysis.focus')}</h2>
          {a.focus.length === 0 && <p className="muted">{t('exam.analysis.noFocus')}</p>}
          {a.focus.map((f) => (
            <div key={f.typeKey} className="row">
              <span className="grow"><strong className="t-title">{f.name}</strong><span className="t-caption muted tnum" style={{ display: 'block' }}>{f.accuracy == null ? t('exam.result.noAnswer') : `%${Math.round(f.accuracy)}`}</span></span>
              <Button size="sm" variant="secondary" loading={add.isPending && add.variables === f.addToPlan.body} onClick={() => add.mutate(f.addToPlan.body)}>{t('exam.analysis.addToPlan')}</Button>
            </div>
          ))}
        </Card>
      </div>
      <section className="stack-sm">
        <h2 className="t-heading-2">{t('exam.analysis.skills')}</h2>
        <ul className={styles.types}>
          {a.skills.map((s) => (
            <li key={s.key} className={styles.type}>
              <span className="row"><strong className="t-title grow">{s.key}</strong><span className="t-body-s muted tnum">{t('exam.result.typeLine', { c: s.correct, w: s.wrong, b: s.blank })}</span></span>
              <ProgressBar value={s.accuracy ?? 0} label={s.key} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
