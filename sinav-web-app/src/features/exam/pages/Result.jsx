import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trophy, TrendingUp, TrendingDown, Lock } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import Button from '@components/Button/Button';
import ScoreBand from '@components/ScoreBand/ScoreBand';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import styles from './Result.module.scss';

const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 }));

// EXAM-10: sonuç özeti. GET /exam-sittings/{code}/result
export default function Result() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { code } = useParams();
  const { data: r, isLoading, isError, error, refetch } = useApiQuery(['exam', 'result', code], () => api.learningExamResultGet(code));
  if (isError) return <div className={styles.page}><ErrorState error={error} onRetry={refetch} /></div>;
  if (isLoading || !r) return <div className={styles.page}><Skeleton height={300} radius={16} /></div>;
  const d = r.deltaFromPrevious;

  return (
    <div className={styles.page}>
      <PageHeader eyebrow={t(`enums.sitting_submit_reason.${r.submitReason}`)} title={r.title} subtitle={t('exam.result.subtitle')} />
      <Card tone="accent" className={styles.hero}>
        <div>
          <p className="t-caption muted">{t('exam.result.score')}</p>
          <p className="t-display-l tnum">{fmt(r.score)}<span className="t-title muted"> / {r.scoreMax}</span></p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {r.isPersonalBest && <Chip tone="reward" icon={<Trophy size={14} />}>{t('exam.personalBest')}</Chip>}
            {d != null && d !== 0 && <Chip icon={d > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}>{t(d > 0 ? 'exam.result.up' : 'exam.result.down', { n: fmt(Math.abs(d)) })}</Chip>}
          </div>
        </div>
        <dl className={styles.stats}>
          <div><dt>{t('exam.result.correct')}</dt><dd className="tnum">{r.correct}</dd></div>
          <div><dt>{t('exam.result.wrong')}</dt><dd className="tnum">{r.wrong}</dd></div>
          <div><dt>{t('exam.result.blank')}</dt><dd className="tnum">{r.blank}</dd></div>
          <div><dt>{t('exam.result.accuracy')}</dt><dd className="tnum">%{Math.round(r.accuracy ?? 0)}</dd></div>
          <div><dt>{t('exam.result.time')}</dt><dd className="tnum">{t('exam.minutes', { n: Math.max(1, Math.round(r.time.usedSeconds / 60)) })}</dd></div>
        </dl>
      </Card>

      <div className={styles.two}>
        {r.target && (
          <Card className="stack-sm">
            <h2 className="t-heading-3">{t('exam.result.target')}</h2>
            <p className="t-body-m">{r.target.gapPoints > 0 ? t('exam.result.gap', { gap: fmt(r.target.gapPoints), n: r.target.requiredCorrect }) : t('exam.result.reached', { score: r.target.score })}</p>
            {r.estimate && <ScoreBand low={r.estimate.low} high={r.estimate.high} target={r.target.score} max={r.scoreMax} label={t('exam.estimate.range', { low: Math.round(r.estimate.low), high: Math.round(r.estimate.high) })} />}
            {r.estimate && <p className="t-caption muted">{t('exam.estimate.range', { low: Math.round(r.estimate.low), high: Math.round(r.estimate.high) })}</p>}
          </Card>
        )}
        <Card className="stack-sm">
          <h2 className="t-heading-3">{t('exam.result.next')}</h2>
          <Button onClick={() => nav(path(Routes.examReview, { code }))}>{t('exam.result.review')}</Button>
          {r.analysisLocked ? (
            <Button variant="secondary" startIcon={<Lock size={16} />} onClick={() => nav(Routes.plans)}>{t('exam.result.analysisLocked')}</Button>
          ) : (
            <Button variant="secondary" onClick={() => nav(path(Routes.examAnalysis, { code }))}>{t('exam.result.analysis')}</Button>
          )}
          <Button variant="tertiary" onClick={() => nav(Routes.exams)}>{t('exam.result.back')}</Button>
        </Card>
      </div>

      <section className="stack-sm" aria-label={t('exam.result.types')}>
        <h2 className="t-heading-2">{t('exam.result.types')}</h2>
        <ul className={styles.types}>
          {r.types.map((x) => (
            <li key={x.key} className={styles.type}>
              <span className="row"><strong className="t-title grow">{x.name}</strong><span className="t-body-s muted tnum">{t('exam.result.typeLine', { c: x.correct, w: x.wrong, b: x.blank })}</span></span>
              <ProgressBar value={x.accuracy ?? 0} label={x.name} tone={x.accuracy != null && x.accuracy >= 70 ? 'success' : 'accent'} />
              <span className="t-caption muted tnum">{x.accuracy == null ? t('exam.result.noAnswer') : `%${Math.round(x.accuracy)}`}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
