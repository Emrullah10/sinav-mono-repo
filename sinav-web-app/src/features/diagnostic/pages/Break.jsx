import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Coffee } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import Button from '@components/Button/Button';
import Card from '@components/Card/Card';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import ErrorState from '@components/ErrorState/ErrorState';
import Routes from '@shared/constant/route-paths';
import { queryClient } from '@shared/providers/QueryProvider';
import useEnrollment, { ENROLLMENT_KEY } from '@features/onboarding/hooks/useEnrollment';
import styles from './Break.module.scss';

// DIAG-02: ara durak. Devam → test ekranı; "Sonra devam ederim" → POST …/pause.
export default function Break() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { enrollment, isLoading: enrLoading } = useEnrollment();
  const code = enrollment?.diagnostic?.sessionCode;
  const { data, isLoading, error, refetch } = useApiQuery(['learning', 'diagnostic', code, 'summary'], () => api.learningDiagnosticGet(code), { enabled: !!code });
  const pause = useApiMutation(() => api.learningDiagnosticPause(code), {
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ENROLLMENT_KEY }); nav(Routes.onbDiagnostic); },
  });
  if (!enrLoading && !code) return <Navigate to={Routes.onbDiagnostic} replace />;
  if (enrLoading || isLoading) return <BubbleLoader fullscreen />;
  if (error) return <div className={styles.page}><ErrorState error={error} onRetry={refetch} /></div>;
  const s = data.session;
  const done = s.progress.answered;
  const mins = Math.round(s.activeSeconds / 60);

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <span className={styles.ico}><Coffee size={28} aria-hidden /></span>
        <h1 className="t-heading-1">{t('diag.break.title')}</h1>
        <p className="muted t-body-l">{t('diag.break.body')}</p>
        <dl className={styles.stats}>
          <div><dt className="t-caption muted">{t('diag.break.done')}</dt><dd className="t-numeric-m tnum">{done} / {s.plannedItemCount}</dd></div>
          <div><dt className="t-caption muted">{t('diag.break.time')}</dt><dd className="t-numeric-m tnum">{t('diag.break.min', { n: mins })}</dd></div>
        </dl>
        <p className="t-body-s muted">{t('diag.break.saved')}</p>
        <div className={styles.actions}>
          <Button size="lg" onClick={() => nav(Routes.diagnosticTest)}>{t('diag.break.continue')}</Button>
          <Button size="lg" variant="tertiary" loading={pause.isPending} onClick={() => pause.mutate()}>{t('diag.break.later')}</Button>
        </div>
      </Card>
    </div>
  );
}
