import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, HelpCircle, Lightbulb } from 'lucide-react';
import api from '@api';
import useApiMutation from '@hooks/useApiMutation';
import Button from '@components/Button/Button';
import Banner from '@components/Banner/Banner';
import Card from '@components/Card/Card';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import Routes from '@shared/constant/route-paths';
import { queryClient } from '@shared/providers/QueryProvider';
import useEnrollment, { ENROLLMENT_KEY } from '../hooks/useEnrollment';
import OnbShell from '../components/OnbShell';
import o from '../components/Onb.module.scss';

const FACTS = [
  { icon: Clock, k: 'onb.level.noTimer' },
  { icon: HelpCircle, k: 'onb.level.skip' },
  { icon: Lightbulb, k: 'onb.level.notExam' },
];

// ONB-05: seviye tespitine giriş. Başlat/sürdür POST /diagnostics; atla POST /diagnostics/skip.
export default function DiagnosticIntro() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { enrollment, isLoading, error, refetch } = useEnrollment();
  const start = useApiMutation(() => api.learningDiagnosticStart(), {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ENROLLMENT_KEY }); nav(Routes.diagnosticTest); },
  });
  const skip = useApiMutation(() => api.learningDiagnosticSkip(), {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ENROLLMENT_KEY }); nav(Routes.diagnosticPlan); },
  });
  if (!isLoading && !error && !enrollment) return <Navigate to={Routes.onbExam} replace />;
  const status = enrollment?.diagnostic?.status;
  const resume = status === 'in_progress' || status === 'paused';

  return (
    <OnbShell
      step="level"
      backTo={Routes.onbAvailability}
      title={t('onb.level.title')}
      subtitle={t('onb.level.subtitle')}
      footer={
        status === 'completed' ? (
          <Button size="lg" onClick={() => nav(Routes.diagnosticResult)}>{t('onb.level.seeResult')}</Button>
        ) : status === 'skipped' ? (
          <Button size="lg" onClick={() => nav(Routes.diagnosticPlan)}>{t('onb.level.seePlan')}</Button>
        ) : (
          <>
            <Button size="lg" loading={start.isPending} disabled={skip.isPending || !enrollment} onClick={() => start.mutate()}>{resume ? t('onb.level.resume') : t('onb.level.start')}</Button>
            <Button size="lg" variant="tertiary" loading={skip.isPending} disabled={start.isPending || !enrollment} onClick={() => skip.mutate()}>{t('onb.level.skipBtn')}</Button>
          </>
        )
      }
    >
      {isLoading && <Skeleton height={160} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {enrollment && (
        <>
          <Card>
            <ul className={o.facts}>
              {FACTS.map(({ icon: I, k }) => (
                <li key={k}>
                  <I size={22} aria-hidden />
                  <div>
                    <strong className="t-body-m">{t(`${k}.title`)}</strong>
                    <p className="t-body-s muted">{t(`${k}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Banner tone="info">{t('onb.level.note')}</Banner>
        </>
      )}
    </OnbShell>
  );
}
