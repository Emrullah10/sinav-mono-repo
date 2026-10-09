import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Target, CreditCard, Receipt, Settings as Cog, LogOut, Flame } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import { signOut } from '@shared/auth/session';
import Routes from '@shared/constant/route-paths';
import Avatar from '@components/Avatar/Avatar';
import Card from '@components/Card/Card';
import ListRow from '@components/ListRow/ListRow';
import Segmented from '@components/Segmented/Segmented';
import ScoreBand from '@components/ScoreBand/ScoreBand';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import Button from '@components/Button/Button';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import styles from '../components/page.module.scss';

// ME-01: profil ve ilerleme. GET /account + GET /progress/overview?range=
export default function Me() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [range, setRange] = useState(30);
  const account = useApiQuery(['me', 'account'], () => api.identityAccountGet());
  const progress = useApiQuery(['me', 'progress', range], () => api.learningProgressOverviewGet(range), { placeholderData: (prev) => prev });
  const p = progress.data;
  const a = account.data;
  const maxMin = Math.max(1, ...(p?.days || []).map((d) => d.activeMinutes));

  return (
    <div className={`${styles.page} ${styles.wide}`}>
      <header className="row">
        <Avatar name={a?.displayName || a?.email || ''} size={56} />
        <div className="grow">
          <h1 className="t-heading-1">{a?.displayName || t('me.noName')}</h1>
          <p className="muted t-body-m">{a?.email}</p>
        </div>
      </header>
      {account.isError && <ErrorState error={account.error} onRetry={account.refetch} />}

      <section className="stack-sm" aria-label={t('me.progress.title')}>
        <div className="row">
          <h2 className="t-heading-2 grow">{t('me.progress.title')}</h2>
          <Segmented label={t('me.progress.range')} value={range} onChange={setRange} options={[7, 30, 90].map((d) => ({ value: d, label: t('me.progress.days', { n: d }) }))} />
        </div>
        {progress.isError && <ErrorState error={progress.error} onRetry={progress.refetch} />}
        {progress.isLoading && <Skeleton height={220} radius={16} />}
        {p && (
          <div className={styles.grid}>
            <Card className="stack-sm">
              <h3 className="t-heading-3">{t('me.progress.estimate')}</h3>
              {p.estimate ? (
                <>
                  <p className="t-numeric-m tnum">{t('me.progress.range2', { low: Math.round(p.estimate.low), high: Math.round(p.estimate.high) })}</p>
                  <ScoreBand low={p.estimate.low} high={p.estimate.high} target={p.target} max={p.estimate.scoreMax || 100} label={t('me.progress.range2', { low: Math.round(p.estimate.low), high: Math.round(p.estimate.high) })} />
                  {p.target != null && <p className="t-caption muted">{t('me.progress.target', { score: p.target })}</p>}
                </>
              ) : <p className="muted">{t('me.progress.noEstimate')}</p>}
            </Card>
            <Card className="stack-sm">
              <h3 className="t-heading-3 row"><Flame size={20} aria-hidden /> {t('me.progress.streak')}</h3>
              <p className="t-numeric-m tnum">{t('me.progress.streakDays', { n: p.streak?.current ?? 0 })}</p>
              <p className="t-caption muted tnum">{t('me.progress.longest', { n: p.streak?.longest ?? 0 })}</p>
              {p.days.length > 0 && <div className={styles.bars} role="img" aria-label={t('me.progress.activity')}>{p.days.map((d) => <i key={d.date} title={`${d.date}: ${d.activeMinutes}`} style={{ height: `${Math.max(4, (d.activeMinutes / maxMin) * 100)}%` }} />)}</div>}
            </Card>
            <Card className="stack-sm" style={{ gridColumn: '1 / -1' }}>
              <dl className={styles.stats}>
                <div><dt>{t('me.progress.minutes')}</dt><dd className="tnum">{p.totals.activeMinutes.toLocaleString('tr-TR')}</dd></div>
                <div><dt>{t('me.progress.questions')}</dt><dd className="tnum">{p.totals.questionsAnswered.toLocaleString('tr-TR')}</dd></div>
                <div><dt>{t('me.progress.accuracy')}</dt><dd className="tnum">{p.totals.accuracy == null ? '-' : `%${Math.round(p.totals.accuracy)}`}</dd></div>
                <div><dt>{t('me.progress.cards')}</dt><dd className="tnum">{p.totals.cardsReviewed.toLocaleString('tr-TR')}</dd></div>
                <div><dt>{t('me.progress.activeDays')}</dt><dd className="tnum">{p.totals.activeDays}</dd></div>
              </dl>
            </Card>
          </div>
        )}
        {p && (
          <Card className="stack-sm">
            <h3 className="t-heading-3">{t('me.progress.types')}</h3>
            <ul className={styles.list}>
              {p.types.map((x) => (
                <li key={x.key} className="stack-sm">
                  <span className="row"><span className="t-title grow">{x.name}</span><span className="t-body-s muted tnum">{t(`me.level.${x.level}`)} · %{Math.round(x.mastery)}</span></span>
                  <ProgressBar value={x.mastery} label={x.name} size="sm" />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <Card className={styles.links} padding="sm">
        <ListRow icon={<Target size={20} />} title={t('me.nav.goal')} onClick={() => nav(Routes.meGoal)} />
        <ListRow icon={<CreditCard size={20} />} title={t('me.nav.subscription')} onClick={() => nav(Routes.meSubscription)} />
        <ListRow icon={<Receipt size={20} />} title={t('me.nav.payment')} onClick={() => nav(Routes.mePayment)} />
        <ListRow icon={<Cog size={20} />} title={t('me.nav.settings')} onClick={() => nav(Routes.meSettings)} />
      </Card>
      <div><Button variant="tertiary" startIcon={<LogOut size={18} />} onClick={() => signOut().then(() => nav(Routes.welcome, { replace: true }))}>{t('me.signOut')}</Button></div>
    </div>
  );
}
