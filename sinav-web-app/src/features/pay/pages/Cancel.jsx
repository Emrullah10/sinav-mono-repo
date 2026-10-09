import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { apiErrorCode } from '@shared/utils/apiError';
import { queryClient } from '@shared/providers/QueryProvider';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import OptionRow from '@components/OptionRow/OptionRow';
import TextInput from '@components/TextInput/TextInput';
import Banner from '@components/Banner/Banner';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import { money } from '../utils';
import styles from './Checkout.module.scss';

const REASONS = ['exam_done', 'too_expensive', 'not_using', 'content_insufficient', 'technical_issue', 'other'];

// PAY-09: iptal akışı. neden → teklifler (GET /subscription/cancel-offers) → onay (POST /subscription/cancel).
export default function Cancel() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [reason, setReason] = useState(null);
  const [step, setStep] = useState('reason'); // reason | offers | confirm | done
  const [note, setNote] = useState('');
  const [done, setDone] = useState(null);
  const sub = useApiQuery(['pay', 'subscription'], () => api.billingSubscriptionGet());
  const offers = useApiQuery(['pay', 'offers', reason], () => api.billingCancelOffersList(reason), { enabled: !!reason && step !== 'reason' });

  const finish = (d) => { queryClient.invalidateQueries({ queryKey: ['pay'] }); setDone(d); setStep('done'); };
  const accept = useApiMutation((o) => api.billingOfferAccept(o.offerKey, {}), {
    onSuccess: (d, o) => {
      if (d.outcome === 'checkout_required') return nav(path(Routes.checkout, { priceKey: d.priceKey }), { state: { price: d.price, productName: o.price?.productName } });
      if (d.outcome === 'client_action') {
        const minutes = Number(d.params?.minutes) || 15;
        return api.learningPlanAdjust({ shortDay: { minutes } }).finally(() => finish({ kind: 'shorter' }));
      }
      return finish({ kind: 'paused', until: d.pausedUntil });
    },
  });
  const cancel = useApiMutation(() => api.billingSubscriptionCancel({ reason, ...(note.trim() ? { note: note.trim() } : {}) }), { onSuccess: (d) => finish({ kind: 'canceled', until: d.until }) });

  if (sub.isLoading) return <div className={styles.page}><SkeletonList rows={2} /></div>;
  if (sub.isError) return <div className={styles.page}><ErrorState error={sub.error} onRetry={sub.refetch} /></div>;
  const s = sub.data;
  const storeManaged = s.store?.managed;
  if (!s.hasSubscription && step !== 'done') return <div className={styles.page}><EmptyState title={t('pay.cancel.none')} action={<Button onClick={() => nav(Routes.plans)}>{t('pay.cancel.seePlans')}</Button>} /></div>;
  if (s.subscription?.cancelAtPeriodEnd && step !== 'done') return <div className={styles.page}><EmptyState title={t('pay.cancel.already')} body={t('pay.cancel.alreadyBody', { date: dayjs(s.subscription.accessUntil || s.validUntil).format('D MMMM YYYY') })} action={<Button onClick={() => nav(Routes.meSubscription)}>{t('pay.cancel.back')}</Button>} /></div>;
  if (storeManaged) return <div className={styles.page}><Banner tone="warning">{t(s.store.noteKey || 'pay.cancel.store')}</Banner><Button variant="secondary" onClick={() => nav(Routes.meSubscription)}>{t('pay.cancel.back')}</Button></div>;

  if (step === 'done') {
    return (
      <div className={styles.page}>
        <Card tone="accent" className="stack">
          <h1 className="t-heading-1">{t(`pay.cancel.done.${done.kind}`)}</h1>
          {done.until && <p className="t-body-m">{t('pay.cancel.doneUntil', { date: dayjs(done.until).format('D MMMM YYYY') })}</p>}
          <Button onClick={() => nav(Routes.meSubscription)}>{t('pay.cancel.back')}</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title={t('pay.cancel.title')} subtitle={t('pay.cancel.subtitle')} />
      {step === 'reason' && (
        <Card className="stack">
          <h2 className="t-heading-3">{t('pay.cancel.why')}</h2>
          <div className="stack-sm" role="radiogroup" aria-label={t('pay.cancel.why')}>
            {REASONS.map((r, i) => <OptionRow key={r} letter={String.fromCharCode(65 + i)} lang="tr" state={reason === r ? 'selected' : 'default'} onClick={() => setReason(r)}>{t(`enums.cancel_reason.${r}`)}</OptionRow>)}
          </div>
          <div className="row"><Button disabled={!reason} onClick={() => setStep('offers')}>{t('common.continue')}</Button><Button variant="tertiary" onClick={() => nav(Routes.meSubscription)}>{t('pay.cancel.keep')}</Button></div>
        </Card>
      )}
      {step === 'offers' && (
        <div className="stack">
          {offers.isLoading && <SkeletonList rows={2} />}
          {offers.isError && <ErrorState error={offers.error} onRetry={offers.refetch} />}
          {offers.data?.offers.length > 0 && <h2 className="t-heading-2">{t('pay.cancel.offers')}</h2>}
          {offers.data?.offers.map((o) => (
            <Card key={o.offerKey} tone="accent" className="stack-sm">
              <h3 className="t-heading-3">{o.title}</h3>
              <p className="t-body-m">{o.body}</p>
              {o.price && <p className="t-body-s muted tnum">{money(o.price.amount, o.price.currency)} · {t('pay.monthlyEq', { amount: money(o.price.monthlyEquivalent) })}</p>}
              {o.pauseUntil && <p className="t-body-s muted">{t('pay.cancel.pauseUntil', { date: dayjs(o.pauseUntil).format('D MMMM YYYY') })}</p>}
              <div><Button loading={accept.isPending && accept.variables?.offerKey === o.offerKey} disabled={accept.isPending} onClick={() => accept.mutate(o)}>{t('pay.cancel.accept')}</Button></div>
            </Card>
          ))}
          {offers.data && (
            <Card className="stack-sm">
              <p className="t-body-m">{offers.data.cancelEffective?.until ? t('pay.cancel.effective', { date: dayjs(offers.data.cancelEffective.until).format('D MMMM YYYY') }) : ''}</p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <Button variant="secondary" onClick={() => setStep('confirm')}>{t('pay.cancel.continueCancel')}</Button>
                <Button variant="tertiary" onClick={() => nav(Routes.meSubscription)}>{t('pay.cancel.keep')}</Button>
              </div>
            </Card>
          )}
        </div>
      )}
      {step === 'confirm' && (
        <Card className="stack">
          <h2 className="t-heading-3">{t('pay.cancel.confirmTitle')}</h2>
          <p className="t-body-m">{t('pay.cancel.effective', { date: dayjs(offers.data?.cancelEffective?.until || s.validUntil).format('D MMMM YYYY') })}</p>
          <TextInput label={t('pay.cancel.note')} multiline rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          {cancel.isError && apiErrorCode(cancel.error) === 'BILLING_STORE_MANAGED' && <Banner tone="warning">{t('pay.cancel.store')}</Banner>}
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <Button variant="destructive" loading={cancel.isPending} onClick={() => cancel.mutate()}>{t('pay.cancel.confirm')}</Button>
            <Button variant="tertiary" onClick={() => nav(Routes.meSubscription)}>{t('pay.cancel.keep')}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
