import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import Banner from '@components/Banner/Banner';
import { formatDate } from '../hooks/useToday';
import { taskTitle } from '../components/TaskCard';

const Stat = ({ label, value }) => (
  <div className="stack-sm" style={{ gap: 2 }}>
    <span className="t-caption muted">{label}</span>
    <span className="t-numeric-m tnum">{value}</span>
  </div>
);

// HOME-02: GET /day-summary.
export default function DayDone() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const q = useApiQuery(['learning', 'day-summary'], () => api.learningDaySummaryGet());
  if (q.isLoading) return <Skeleton height={280} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const { activity: a, streak, tomorrow, date } = q.data;
  const tomorrowTasks = tomorrow?.tasks || [];
  return (
    <div className="stack">
      <PageHeader eyebrow={formatDate(date, i18n.language)} title={t('home.sum.title')} subtitle={t('home.sum.subtitle')} actions={<Button variant="secondary" onClick={() => nav(Routes.today)}>{t('home.sum.back')}</Button>} />
      <Banner tone={a.goalMet ? 'success' : 'info'} title={a.goalMet ? t('home.sum.goalMet') : undefined}>
        {a.goalMet ? t('home.streak', { n: streak?.current ?? 0 }) : t('home.sum.goalNotMet', { n: a.goalMinutes })}
      </Banner>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--space-5)', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <Stat label={t('home.sum.minutes')} value={t('home.sum.min', { n: a.activeMinutes })} />
          <Stat label={t('home.sum.questions')} value={a.questionsAnswered} />
          <Stat label={t('home.sum.accuracy')} value={a.questionsAnswered ? `%${Math.round((a.accuracy <= 1 ? a.accuracy * 100 : a.accuracy))}` : '-'} />
          <Stat label={t('home.sum.cards')} value={a.cardsReviewed} />
          <Stat label={t('home.sum.newCards')} value={a.newCards} />
          <Stat label={t('home.sum.notes')} value={a.notesRead} />
        </div>
      </Card>
      <Card>
        <div className="stack-sm">
          <h2 className="t-heading-2 row"><CheckCircle2 size={20} aria-hidden /> {t('home.sum.tomorrow')}</h2>
          {tomorrowTasks.length === 0 ? <p className="muted">{t('home.sum.tomorrowNone')}</p> : (
            <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
              {tomorrowTasks.map((x) => <li key={x.code} className="t-body-m">{taskTitle(t, x)} <span className="muted">({t('home.taskMeta', { min: x.estimatedMinutes })})</span></li>)}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
