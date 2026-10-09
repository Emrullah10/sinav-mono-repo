import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, ListChecks, Pause, Pencil } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { apiErrorCode, apiErrorDetails } from '@shared/utils/apiError';
import { notify } from '@shared/utils/notify';
import { getApiErrorMessage } from '@shared/utils/apiError';
import Routes, { path } from '@shared/constant/route-paths';
import { queryClient } from '@shared/providers/QueryProvider';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Segmented from '@components/Segmented/Segmented';
import Banner from '@components/Banner/Banner';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import styles from './Intro.module.scss';

// EXAM-02: başlangıç ve kurallar. GET /exam-forms/{code} → POST /exam-sittings
export default function Intro() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { id } = useParams();
  const { data: f, isLoading, isError, error, refetch } = useApiQuery(['exam', 'form', id], () => api.learningExamFormGet(id));
  const [mode, setMode] = useState(null);
  useEffect(() => { if (f && !mode) setMode(f.defaultMode); }, [f, mode]);

  const start = useApiMutation(() => api.learningExamStart(f.code, mode), {
    onSuccess: (d) => { queryClient.invalidateQueries({ queryKey: ['exam'] }); nav(path(Routes.examSitting, { code: d.sitting.code }), { replace: true }); },
    onError: (e) => {
      const code = apiErrorCode(e);
      if (code === 'EXAM_SITTING_ACTIVE') {
        const c = apiErrorDetails(e)?.sittingCode;
        notify(getApiErrorMessage(e), 'error');
        if (c) nav(path(Routes.examSitting, { code: c }));
      } else notify(getApiErrorMessage(e), 'error');
    },
  });

  if (isError) return <div className={styles.page}><ErrorState error={error} onRetry={refetch} /></div>;
  if (isLoading || !f) return <div className={styles.page}><Skeleton height={320} radius={16} /></div>;
  const q = f.quota;
  const noQuota = q?.enabled && q.limit != null && q.remaining === 0;
  const minutes = Math.round(f.effectiveDurationSeconds / 60);

  return (
    <div className={styles.page}>
      <PageHeader eyebrow={t(`enums.exam_form_type.${f.formType}`)} title={f.title} subtitle={t('exam.intro.subtitle')} />
      <div className={styles.grid}>
        <Card className="stack">
          <ul className={styles.facts}>
            <li><ListChecks size={18} aria-hidden /> {t('exam.questions', { n: f.questionCount })}</li>
            <li><Clock size={18} aria-hidden /> {t('exam.minutes', { n: minutes })}{f.extraTimePercent > 0 && <span className="muted"> · {t('exam.intro.extra', { n: f.extraTimePercent })}</span>}</li>
            <li><Pencil size={18} aria-hidden /> {t('exam.intro.scoring', { correct: f.scoring.params.perCorrect, max: f.scoring.scoreMax })}</li>
            {f.rules.canPause && <li><Pause size={18} aria-hidden /> {t('exam.intro.canPause')}</li>}
          </ul>
          <div className="stack-sm">
            <h2 className="t-heading-3">{t('exam.intro.rules')}</h2>
            <ul className={styles.rules}>
              <li>{f.rules.wrongPenalty > 0 ? t('exam.rules.penalty') : t('exam.rules.noPenalty')}</li>
              <li>{f.rules.blankPenalty > 0 ? t('exam.rules.blankPenalty') : t('exam.rules.blank')}</li>
              <li>{f.rules.canChangeAnswers ? t('exam.rules.change') : t('exam.rules.noChange')}</li>
              <li>{t('exam.rules.autosave')}</li>
              <li>{t('exam.rules.tutorClosed')}</li>
              <li>{t('exam.rules.keys')}</li>
            </ul>
          </div>
          <div className="stack-sm">
            <h2 className="t-heading-3">{t('exam.intro.sections')}</h2>
            <table className={styles.table}>
              <thead><tr><th scope="col">{t('exam.intro.section')}</th><th scope="col">{t('exam.intro.range')}</th><th scope="col">{t('exam.intro.count')}</th></tr></thead>
              <tbody>{f.sections.map((s) => <tr key={s.typeKey}><td>{s.name}</td><td className="tnum">{s.firstQuestionNo}–{s.lastQuestionNo}</td><td className="tnum">{s.questionCount}</td></tr>)}</tbody>
            </table>
          </div>
        </Card>
        <Card className="stack" tone="accent">
          {f.modes?.length > 1 && !f.activeSittingCode && (
            <div className="stack-sm">
              <h2 className="t-heading-3">{t('exam.intro.mode')}</h2>
              <Segmented label={t('exam.intro.mode')} value={mode} onChange={setMode} options={f.modes.map((m) => ({ value: m, label: t(`enums.study_mode.${m}`) }))} />
              <p className="t-body-s muted">{t(`exam.mode.${mode}`)}</p>
            </div>
          )}
          {q?.enabled && q.limit != null && <p className="t-body-m tnum">{t('exam.intro.quota', { remaining: q.remaining, limit: q.limit })}</p>}
          {f.locked && <Banner tone="accent">{t('exam.intro.locked')}</Banner>}
          {noQuota && !f.locked && <Banner tone="accent">{t('exam.intro.noQuota')}</Banner>}
          {f.locked || noQuota ? (
            <Button size="lg" onClick={() => nav(Routes.plans)}>{t('exam.unlock')}</Button>
          ) : (
            <Button size="lg" loading={start.isPending} onClick={() => start.mutate()}>{f.activeSittingCode ? t('exam.continue') : t('exam.intro.start')}</Button>
          )}
          <Button variant="tertiary" onClick={() => nav(Routes.exams)}>{t('common.back')}</Button>
        </Card>
      </div>
    </div>
  );
}
