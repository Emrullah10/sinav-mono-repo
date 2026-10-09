import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Button from '@components/Button/Button';
import Banner from '@components/Banner/Banner';
import Card from '@components/Card/Card';
import ScoreBand from '@components/ScoreBand/ScoreBand';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import Chip from '@components/Chip/Chip';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import Routes from '@shared/constant/route-paths';
import OnbShell from '@features/onboarding/components/OnbShell';
import useEnrollment from '@features/onboarding/hooks/useEnrollment';
import styles from './Result.module.scss';

const num = (v) => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 });

// DIAG-03: sonuç. Veri: GET /diagnostics/{code}/result. Puan her zaman aralık olarak gösterilir.
export default function Result() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { enrollment, isLoading: enrLoading } = useEnrollment();
  const code = enrollment?.diagnostic?.sessionCode;
  const { data: r, isLoading, error, refetch } = useApiQuery(['learning', 'diagnostic', code, 'result'], () => api.learningDiagnosticResultGet(code), { enabled: !!code });
  if (!enrLoading && !code) return <Navigate to={Routes.onbDiagnostic} replace />;
  const nameOf = (k) => r.types.find((x) => x.typeKey === k)?.name || k;
  const e = r?.estimate;

  return (
    <OnbShell step="level" title={t('diag.result.title')} subtitle={t('diag.result.subtitle')} wide footer={r && <Button size="lg" onClick={() => nav(Routes.diagnosticPlan)}>{t('diag.result.seePlan')}</Button>}>
      {(enrLoading || isLoading) && <Skeleton height={220} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {r && (
        <>
          <Card className={styles.est}>
            <p className="t-caption muted">{t('diag.result.estimate')}</p>
            <p className={`${styles.big} tnum`}>{num(e.low)} – {num(e.high)} <span className="t-body-l muted">{t('onb.goal.points', { n: '' }).trim()}</span></p>
            <ScoreBand low={e.low} high={e.high} target={r.target.score} max={e.scoreMax} label={t('diag.result.bandLabel', { low: num(e.low), high: num(e.high), target: num(r.target.score) })} />
            <p className="t-body-s muted">{t('diag.result.target', { score: num(r.target.score), n: r.target.requiredCorrect })}</p>
          </Card>
          {e.confidence < 0.6 && <Banner tone="info">{t('diag.result.lowConfidence', { n: e.basisQuestionCount })}</Banner>}
          <Card>
            <h2 className="t-heading-3">{t('diag.result.totals')}</h2>
            <p className="t-body-m tnum">{t('diag.result.totalsLine', { correct: r.totals.correct, wrong: r.totals.wrong, blank: r.totals.blank, total: r.totals.total })}</p>
          </Card>
          <div className={styles.cols}>
            {r.strongest.length > 0 && (
              <Card><h2 className="t-heading-3">{t('diag.result.strong')}</h2><div className={styles.chips}>{r.strongest.map((k) => <Chip key={k} tone="success">{nameOf(k)}</Chip>)}</div></Card>
            )}
            {r.weakest.length > 0 && (
              <Card><h2 className="t-heading-3">{t('diag.result.weak')}</h2><div className={styles.chips}>{r.weakest.map((k) => <Chip key={k} tone="warning">{nameOf(k)}</Chip>)}</div></Card>
            )}
          </div>
          <Card>
            <h2 className="t-heading-3">{t('diag.result.types')}</h2>
            <ul className={styles.types}>
              {r.types.map((x) => (
                <li key={x.typeKey}>
                  <div className="row"><span className="grow t-body-m">{x.name}</span><span className="t-caption muted tnum">{x.answered ? `%${Math.round((x.estimatedAccuracy ?? 0) * 100)}` : t('diag.result.noData')}</span></div>
                  <ProgressBar value={x.answered ? (x.estimatedAccuracy ?? 0) * 100 : 0} size="sm" label={x.name} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </OnbShell>
  );
}
