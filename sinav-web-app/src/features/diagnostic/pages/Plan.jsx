import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Clock } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Button from '@components/Button/Button';
import Card from '@components/Card/Card';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import EmptyState from '@components/EmptyState/EmptyState';
import Routes from '@shared/constant/route-paths';
import { useAuthStore, isGuestUser } from '@store/authStore';
import { useOnboardingStore } from '@store/onboardingStore';
import OnbShell from '@features/onboarding/components/OnbShell';
import useEnrollment from '@features/onboarding/hooks/useEnrollment';
import styles from './Plan.module.scss';

// DIAG-04: ilk 7 günlük plan önizlemesi. Veri: GET /plan/preview?days=7. Misafir kayda, öğrenci Bugün'e gider.
export default function Plan() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const guest = useAuthStore((s) => isGuestUser(s.user));
  const reset = useOnboardingStore((s) => s.reset);
  const { enrollment, isLoading: enrLoading } = useEnrollment();
  const { data, isLoading, error, refetch } = useApiQuery(['learning', 'plan', 'preview', 7], () => api.learningPlanPreviewGet(7), { enabled: !!enrollment });
  if (!enrLoading && !enrollment) return <Navigate to={Routes.onbExam} replace />;

  const reason = (task) => {
    const p = task.reasonParams || {};
    return t(`diag.reason.${task.reason}`, { defaultValue: '', typeName: p.typeName, skillName: p.skillName, count: p.count, daysToExam: p.daysToExam });
  };
  const finish = () => {
    if (guest) nav(Routes.signUp);
    else { reset(); nav(Routes.today); }
  };

  return (
    <OnbShell
      step="plan"
      title={t('diag.plan.title')}
      subtitle={enrollment?.daysToExam != null ? t('diag.plan.subtitleDays', { n: enrollment.daysToExam }) : t('diag.plan.subtitle')}
      wide
      footer={data && <Button size="lg" onClick={finish}>{guest ? t('diag.plan.save') : t('diag.plan.go')}</Button>}
    >
      {(enrLoading || isLoading) && <Skeleton height={240} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data && data.days.length === 0 && <EmptyState title={t('diag.plan.empty')} />}
      {data && (
        <ol className={styles.days}>
          {data.days.map((d) => (
            <li key={d.code}>
              <Card>
                <div className="row">
                  <h2 className="t-heading-3 grow">{dayjs(d.date).format('D MMMM dddd')}</h2>
                  {d.status === 'rest' ? <span className="t-caption muted">{t('diag.plan.rest')}</span> : <span className="t-caption muted row"><Clock size={14} aria-hidden /> {t('onb.av.min', { n: d.plannedMinutes })}</span>}
                </div>
                {d.tasks.length > 0 && (
                  <ul className={styles.tasks}>
                    {d.tasks.map((k) => (
                      <li key={k.code}>
                        <strong className="t-body-m">{k.questionType?.name || t(`enums.plan_task_kind.${k.kind}`)}</strong>
                        <span className="t-caption muted"> {k.questionType?.name ? `· ${t(`enums.plan_task_kind.${k.kind}`)} ` : ''}· {t('onb.av.min', { n: k.estimatedMinutes })}</span>
                        {reason(k) && <p className="t-body-s muted">{reason(k)}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}
      {data && guest && <p className="t-body-s muted">{t('diag.plan.saveHint')}</p>}
    </OnbShell>
  );
}
