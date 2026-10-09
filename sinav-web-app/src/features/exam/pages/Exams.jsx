import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, Clock, ListChecks } from 'lucide-react';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import Button from '@components/Button/Button';
import ScoreBand from '@components/ScoreBand/ScoreBand';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import styles from './Exams.module.scss';

const TYPES = ['full', 'mini', 'question_type_drill'];

// EXAM-01: deneme merkezi. GET /exams/overview
export default function Exams() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { data, isLoading, isError, error, refetch } = useApiQuery(['exam', 'overview'], () => api.learningExamsOverviewGet());
  if (isError) return <div className={styles.page}><ErrorState error={error} onRetry={refetch} /></div>;
  const forms = data?.forms || [];
  const quota = (f) => (f.formType === 'full' ? data?.usage?.full : f.formType === 'mini' ? data?.usage?.mini : null);

  return (
    <div className={styles.page}>
      <PageHeader title={t('exam.title')} subtitle={t('exam.subtitle')} />
      {isLoading && <SkeletonList rows={4} height={96} />}
      {data && (
        <>
          <div className={styles.top}>
            <Card className="stack-sm">
              <h2 className="t-heading-3">{t('exam.estimate.title')}</h2>
              {data.estimate ? (
                <>
                  <p className="t-numeric-m tnum">{t('exam.estimate.range', { low: Math.round(data.estimate.low), high: Math.round(data.estimate.high) })}</p>
                  <ScoreBand low={data.estimate.low} high={data.estimate.high} max={data.scoreMax} label={t('exam.estimate.range', { low: Math.round(data.estimate.low), high: Math.round(data.estimate.high) })} />
                </>
              ) : <p className="muted">{t('exam.estimate.none')}</p>}
            </Card>
            <Card className="stack-sm">
              <h2 className="t-heading-3">{t('exam.usage.title')}</h2>
              {['full', 'mini'].map((k) => {
                const u = data.usage?.[k];
                return (
                  <p key={k} className="row t-body-m">
                    <span className="grow">{t(`enums.exam_form_type.${k}`)}</span>
                    <span className="tnum">{!u?.enabled ? t('exam.usage.premiumOnly') : u.limit == null ? t('exam.usage.unlimited') : t('exam.usage.left', { remaining: u.remaining, limit: u.limit })}</span>
                  </p>
                );
              })}
            </Card>
          </div>

          {forms.length === 0 && <EmptyState icon={<ListChecks size={32} />} title={t('exam.empty.title')} body={t('exam.empty.body')} />}
          {TYPES.map((type) => {
            const list = forms.filter((f) => f.formType === type);
            if (!list.length) return null;
            return (
              <section key={type} className="stack-sm" aria-label={t(`enums.exam_form_type.${type}`)}>
                <h2 className="t-heading-2">{t(`enums.exam_form_type.${type}`)}</h2>
                <div className={styles.grid}>
                  {list.map((f) => {
                    const q = quota(f);
                    const noQuota = q && q.enabled && q.limit != null && q.remaining === 0;
                    return (
                      <Card key={f.code} className={styles.form}>
                        <div className="row">
                          <h3 className="t-title grow">{f.title}</h3>
                          {f.isRecommended && <Chip size="sm" tone="accent">{t('exam.recommended')}</Chip>}
                          {f.locked && <Chip size="sm" icon={<Lock size={14} />}>{t('exam.premium')}</Chip>}
                        </div>
                        <p className="t-body-s muted row"><ListChecks size={16} aria-hidden /> {t('exam.questions', { n: f.questionCount })} <Clock size={16} aria-hidden /> {t('exam.minutes', { n: Math.round(f.durationSeconds / 60) })}</p>
                        <p className="t-caption muted tnum">
                          {f.taken > 0 ? t('exam.taken', { n: f.taken }) : t('exam.notTaken')}
                          {f.bestScore != null && ` · ${t('exam.best', { score: f.bestScore })}`}
                        </p>
                        {f.activeSittingCode ? (
                          <Button onClick={() => nav(path(Routes.examSitting, { code: f.activeSittingCode }))}>{t('exam.continue')}</Button>
                        ) : f.locked ? (
                          <Button variant="secondary" onClick={() => nav(Routes.plans)}>{t('exam.unlock')}</Button>
                        ) : (
                          <Button variant={noQuota ? 'secondary' : 'primary'} onClick={() => nav(noQuota ? Routes.plans : path(Routes.examIntro, { id: f.code }))}>{noQuota ? t('exam.noQuota') : t('exam.open')}</Button>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="stack-sm" aria-label={t('exam.history.title')}>
            <h2 className="t-heading-2">{t('exam.history.title')}</h2>
            {data.history.length === 0 ? <p className="muted">{t('exam.history.empty')}</p> : (
              <ul className={styles.history}>
                {data.history.map((h) => (
                  <li key={h.code}>
                    <Link to={path(Routes.examResult, { code: h.code })} className={styles.row}>
                      <span className="grow"><strong className="t-title">{h.title}</strong><span className="t-caption muted" style={{ display: 'block' }}>{dayjs(h.submittedAt).format('D MMMM YYYY HH:mm')}</span></span>
                      {h.isPersonalBest && <Chip size="sm" tone="reward">{t('exam.personalBest')}</Chip>}
                      <span className="t-numeric-m tnum">{h.score.toLocaleString('tr-TR')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
