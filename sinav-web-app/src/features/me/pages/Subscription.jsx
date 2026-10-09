import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { queryClient } from '@shared/providers/QueryProvider';
import Routes from '@shared/constant/route-paths';
import { money } from '@features/pay/utils';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import Button from '@components/Button/Button';
import Banner from '@components/Banner/Banner';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import styles from '../components/page.module.scss';

const d = (v) => dayjs(v).format('D MMMM YYYY');

// ME-07 / PAY-08: abonelik. GET /subscription (+ /entitlements deneme bilgisi)
export default function Subscription() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useApiQuery(['pay', 'subscription'], () => api.billingSubscriptionGet());
  const ent = useApiQuery(['pay', 'entitlements'], () => api.billingEntitlementsGet());
  const resume = useApiMutation(() => api.billingSubscriptionResume(), { successMessage: 'me.sub.resumed', onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pay'] }) });

  if (q.isError) return <div className={styles.page}><ErrorState error={q.error} onRetry={q.refetch} /></div>;
  if (q.isLoading || !q.data) return <div className={styles.page}><Skeleton height={260} radius={16} /></div>;
  const s = q.data;
  const sub = s.subscription;
  const trial = ent.data?.trial;
  const store = s.store?.managed;

  return (
    <div className={styles.page}>
      <PageHeader title={t('me.sub.title')} />
      {sub?.status === 'trialing' && trial?.active && <Banner tone="accent" title={t('me.sub.trialEnding', { n: trial.daysLeft })}>{sub.willRenew ? t('me.sub.trialRenews', { date: d(sub.trialEndsAt), amount: money(sub.renewalAmount) }) : t('me.sub.trialNoCard')}</Banner>}
      {s.status === 'past_due' && <Banner tone="error" title={t('me.sub.pastDue')}>{t('me.sub.pastDueBody', { date: d(sub.accessUntil) })}</Banner>}
      {sub?.cancelAtPeriodEnd && <Banner tone="warning">{t('me.sub.cancelPending', { date: d(sub.accessUntil || s.validUntil) })}</Banner>}
      {s.status === 'paused' && <Banner tone="info">{t('me.sub.paused', { date: sub?.pausedUntil ? d(sub.pausedUntil) : '' })}</Banner>}

      <Card className="stack">
        <div className="row">
          <h2 className="t-heading-2 grow">{s.plan.name}</h2>
          <Chip tone={s.tier === 'premium' ? 'accent' : 'default'}>{s.hasSubscription ? t(`enums.subscription_status.${s.status}`) : t('me.sub.free')}</Chip>
        </div>
        {s.hasSubscription ? (
          <dl className={styles.stats}>
            <div><dt>{t('me.sub.price')}</dt><dd className="tnum">{s.plan.amount != null ? money(s.plan.amount, s.plan.currency) : '-'}</dd></div>
            <div><dt>{t('me.sub.validUntil')}</dt><dd className="tnum" style={{ fontSize: 16 }}>{s.validUntil ? d(s.validUntil) : '-'}</dd></div>
            <div><dt>{sub.willRenew ? t('me.sub.renews') : t('me.sub.noRenew')}</dt><dd className="tnum" style={{ fontSize: 16 }}>{sub.willRenew ? `${d(sub.renewalDate)} · ${money(sub.renewalAmount)}` : '-'}</dd></div>
            <div><dt>{t('me.sub.channel')}</dt><dd style={{ fontSize: 16 }}>{t(`enums.sales_channel.${sub.channel}`)}</dd></div>
          </dl>
        ) : <p className="muted">{t('me.sub.freeBody')}</p>}
        {s.paymentMethod && <p className="t-body-m">{t('me.sub.card', { brand: s.paymentMethod.brand, last4: s.paymentMethod.last4, mm: String(s.paymentMethod.expMonth).padStart(2, '0'), yy: String(s.paymentMethod.expYear).slice(-2) })}</p>}
        {store && <Banner tone="info">{t(s.store.noteKey || 'me.sub.store')}</Banner>}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {!s.hasSubscription && <Button onClick={() => nav(Routes.plans)}>{t('me.sub.upgrade')}</Button>}
          {s.hasSubscription && (sub.cancelAtPeriodEnd || s.status === 'paused') && !store && <Button loading={resume.isPending} onClick={() => resume.mutate()}>{s.status === 'paused' ? t('me.sub.resumePaused') : t('me.sub.resume')}</Button>}
          {s.hasSubscription && !sub.cancelAtPeriodEnd && !store && s.status !== 'paused' && <Button variant="secondary" onClick={() => nav(Routes.cancel)}>{t('me.sub.cancel')}</Button>}
          {s.hasSubscription && <Button variant="tertiary" onClick={() => nav(Routes.plans)}>{t('me.sub.changePlan')}</Button>}
          <Button variant="tertiary" onClick={() => nav(Routes.mePayment)}>{t('me.sub.payments')}</Button>
        </div>
      </Card>
    </div>
  );
}
