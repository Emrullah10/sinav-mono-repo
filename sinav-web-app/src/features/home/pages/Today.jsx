import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookX, Layers, Flame, Target, CalendarDays, Gauge } from 'lucide-react';
import classNames from 'classnames';
import api from '@api';
import useApiMutation from '@hooks/useApiMutation';
import Routes from '@shared/constant/route-paths';
import { queryClient } from '@shared/providers/QueryProvider';
import PageHeader from '@components/PageHeader/PageHeader';
import Button from '@components/Button/Button';
import Card from '@components/Card/Card';
import Banner from '@components/Banner/Banner';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import ListRow from '@components/ListRow/ListRow';
import useToday, { TODAY_KEY, formatDate } from '../hooks/useToday';
import useStartTask from '../hooks/useStartTask';
import TaskCard from '../components/TaskCard';
import AdjustModal from '../components/AdjustModal';
import ScoreBandCard from '../components/ScoreBandCard';
import styles from './Today.module.scss';

const WEEKDAYS = { tr: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] };

// HOME-01: bugünün planı. GET /today; görev başlat/ertele/atla.
export default function Today() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const q = useToday();
  const start = useStartTask();
  const refresh = () => queryClient.invalidateQueries({ queryKey: TODAY_KEY });
  const postpone = useApiMutation((code) => api.learningPlanTaskPostpone(code), { onSuccess: refresh });
  const skip = useApiMutation((code) => api.learningPlanTaskSkip(code), { onSuccess: refresh });

  if (q.isLoading) return <div className="stack"><Skeleton height={48} width="50%" /><Skeleton height={320} /></div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;

  const d = q.data;
  const day = d.day;
  const tasks = day?.tasks || [];
  const nextTask = tasks.find((x) => x.code === d.nextTaskCode) || tasks.find((x) => x.status === 'pending' || x.status === 'in_progress');
  const allDone = tasks.length > 0 && tasks.every((x) => ['completed', 'skipped', 'postponed'].includes(x.status));
  const diagPending = d.diagnostic?.status && d.diagnostic.status !== 'completed' && d.diagnostic.status !== 'skipped';
  const planned = day?.plannedMinutes || 0;
  const pct = planned ? Math.min(100, Math.round(((day?.completedMinutes || 0) / planned) * 100)) : 0;
  const startTask = (task) => { setBusy(task.code); start.mutate(task.code, { onSettled: () => setBusy(null) }); };
  const act = (m) => (task) => { setBusy(task.code); m.mutate(task.code, { onSettled: () => setBusy(null) }); };
  const settled = d.streak?.settled;
  const lang = i18n.language?.startsWith('en') ? 'en' : 'tr';
  const lim = d.usage?.questionsPerDay;
  const quotaFull = lim && lim.limit != null && lim.remaining === 0;

  return (
    <div className="stack">
      <PageHeader
        eyebrow={formatDate(d.date, i18n.language)}
        title={t('home.title')}
        actions={(
          <>
            <Button variant="secondary" onClick={() => setAdjustOpen(true)}>{t('home.editPlan')}</Button>
            {nextTask && <Button loading={busy === nextTask.code} onClick={() => startTask(nextTask)}>{t('home.startNext')}</Button>}
          </>
        )}
      />
      {diagPending && (
        <Banner tone="warning" title={t('home.diag.title')} action={<Button size="sm" onClick={() => nav(Routes.diagnosticStart)}>{t('home.diag.cta')}</Button>}>{t('home.diag.body')}</Banner>
      )}
      {settled?.broken && <Banner tone="warning">{t('home.streak.broken', { n: settled.previousLength })}</Banner>}
      {settled && !settled.broken && settled.freezesUsed > 0 && <Banner tone="info">{t('home.streak.freezeUsed', { n: settled.missedDays })}</Banner>}
      {d.streak?.atRisk && <Banner tone="warning">{t('home.streak.atRisk')}</Banner>}
      {d.access?.tier === 'free' && d.access.trialEndsAt && <Banner tone="accent">{t('home.trial', { date: formatDate(d.access.trialEndsAt, i18n.language, { day: 'numeric', month: 'long' }) })}</Banner>}
      {quotaFull && <Banner tone="warning" action={<Button size="sm" onClick={() => nav(Routes.premium)}>{t('home.usage.title')}</Button>}>{t('home.usage.line', { used: lim.used, limit: lim.limit })}</Banner>}

      <div className={styles.grid}>
        <div className="stack">
          <Card>
            <div className="stack">
              {!day || day.status === 'rest' || tasks.length === 0 ? (
                <EmptyState title={day?.status === 'rest' ? t('home.restDay') : t('home.noPlan')} body={t('home.noPlanBody')} action={<Button variant="secondary" onClick={() => nav(Routes.study)}>{t('home.freeStudy')}</Button>} />
              ) : (
                <>
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <h2 className="t-heading-2">{t('home.tasksTitle')}</h2>
                    <span className="t-body-s muted tnum">{t('home.minutesDone', { done: day.completedMinutes, total: planned })} · {t('home.completion', { n: pct })}</span>
                  </div>
                  <ProgressBar value={pct} label={t('home.tasksTitle')} />
                  {allDone && (
                    <Banner tone="success" title={t('home.dayComplete')} action={<Button size="sm" variant="secondary" onClick={() => nav(Routes.dayDone)}>{t('home.daySummary')}</Button>}>{t('home.dayCompleteBody')}</Banner>
                  )}
                  <div className="stack-sm">
                    {tasks.map((task, i) => (
                      <TaskCard key={task.code} task={task} index={i} isNext={nextTask?.code === task.code} busy={busy === task.code && (start.isPending || postpone.isPending || skip.isPending)}
                        onStart={startTask} onPostpone={act(postpone)} onSkip={act(skip)} />
                    ))}
                  </div>
                  {allDone && <Button variant="secondary" onClick={() => nav(Routes.practiceSetup)}>{t('home.extra')}</Button>}
                </>
              )}
            </div>
          </Card>
          <div className={styles.pair}>
            <Card>
              <ListRow icon={<BookX size={20} />} title={t('home.due.mistakes')} subtitle={d.due?.mistakes ? t('home.due.mistakesBody', { n: d.due.mistakes }) : t('home.due.mistakesNone')} onClick={() => nav(Routes.mistakes)} />
              {d.due?.mistakes > 0 && <Button variant="tertiary" size="sm" onClick={() => nav(Routes.mistakeReview)}>{t('home.due.mistakesCta')}</Button>}
            </Card>
            <Card>
              <ListRow icon={<Layers size={20} />} title={t('home.due.cards')} subtitle={d.due?.cards ? t('home.due.cardsBody', { n: d.due.cards }) : t('home.due.cardsNone')} onClick={() => nav(Routes.vocab)} />
              {d.due?.cards > 0 && <Button variant="tertiary" size="sm" onClick={() => nav(Routes.vocabReview)}>{t('home.due.cardsCta')}</Button>}
            </Card>
          </div>
        </div>

        <aside className="stack">
          <ScoreBandCard estimate={d.estimate} enrollment={d.enrollment} requiredCorrect={d.requiredCorrect} />
          <Card>
            <div className="stack-sm">
              <h2 className="t-heading-3 row"><CalendarDays size={18} aria-hidden /> {t('home.week.title')}</h2>
              <ol className={styles.week}>
                {(d.streak?.week || []).map((w, i) => {
                  const state = w.freezeUsed ? 'frozen' : w.goalMet ? 'goalMet' : w.active ? 'active' : 'none';
                  return (
                    <li key={w.date} className={classNames(styles.day, w.isToday && styles.today)} aria-label={`${WEEKDAYS[lang][i]}: ${t(`home.week.${state}`)}${w.isToday ? `, ${t('home.week.today')}` : ''}`}>
                      <span className="t-caption muted">{WEEKDAYS[lang][i]}</span>
                      <span className={classNames(styles.dot, styles[state])} aria-hidden>{w.goalMet ? '✓' : w.active ? '·' : ''}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="row t-body-s"><Flame size={16} aria-hidden /> {t('home.streak', { n: d.streak?.current ?? 0 })}{d.streak?.freezes > 0 && <span className="muted"> · {t('home.streak.freezes', { n: d.streak.freezes })}</span>}</p>
            </div>
          </Card>
          <Card>
            <div className="stack-sm">
              <h2 className="t-heading-3 row"><Target size={18} aria-hidden /> {t('home.goal.title')}</h2>
              <ProgressBar value={d.goal?.minutes ? Math.min(100, (d.goal.activeMinutes / d.goal.minutes) * 100) : 0} label={t('home.goal.title')} tone="accent" />
              <p className="t-body-s">{d.goal?.met ? t('home.goal.met') : t('home.goal.line', { done: d.goal?.activeMinutes ?? 0, total: d.goal?.minutes ?? 0 })}</p>
              <p className="t-caption muted">{t('home.goal.stats', { q: d.goal?.questionsAnswered ?? 0, c: d.goal?.correctAnswers ?? 0, cards: d.goal?.cardsReviewed ?? 0 })}</p>
            </div>
          </Card>
          {lim && (
            <Card>
              <div className="stack-sm">
                <h2 className="t-heading-3 row"><Gauge size={18} aria-hidden /> {t('home.usage.title')}</h2>
                {lim.limit == null ? <p className="t-body-s">{t('home.usage.unlimited')}</p> : (
                  <>
                    <ProgressBar value={(lim.used / lim.limit) * 100} label={t('home.usage.title')} />
                    <p className="t-body-s">{t('home.usage.line', { used: lim.used, limit: lim.limit })}</p>
                  </>
                )}
              </div>
            </Card>
          )}
        </aside>
      </div>
      <AdjustModal open={adjustOpen} onClose={() => setAdjustOpen(false)} defaultMinutes={day?.plannedMinutes} />
    </div>
  );
}
