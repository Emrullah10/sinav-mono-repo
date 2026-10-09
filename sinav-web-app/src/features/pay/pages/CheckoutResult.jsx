import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle } from 'lucide-react';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import { queryClient } from '@shared/providers/QueryProvider';
import Routes, { path } from '@shared/constant/route-paths';
import { useEffect } from 'react';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import ErrorState from '@components/ErrorState/ErrorState';
import { money } from '../utils';
import styles from './Checkout.module.scss';

// PAY-06 (başarı) / PAY-07 (hata): ödeme sonucu. 3D Secure dönüşü /odeme/sonuc?payment=KOD → GET /payments/{code}; deneme başlangıcı ?trial=1.
export default function CheckoutResult() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const code = sp.get('payment');
  const trial = sp.get('trial') === '1';
  const pay = useApiQuery(['pay', 'payment', code], () => api.billingPaymentGet(code), {
    enabled: !!code,
    refetchInterval: (q) => (['pending', 'requires_action'].includes(q.state.data?.status) ? 2000 : false),
  });
  const ent = useApiQuery(['pay', 'entitlements'], () => api.billingEntitlementsGet(), { staleTime: 0 });
  const status = pay.data?.status;
  useEffect(() => { if (trial || status === 'succeeded') queryClient.invalidateQueries({ queryKey: ['pay'] }); }, [trial, status]);

  const cancel = async () => { try { await api.billingPaymentCancel(code); } catch { /* zaten sonuçlanmış olabilir */ } nav(Routes.plans); };

  if (code && pay.isError) return <div className={styles.page}><ErrorState error={pay.error} onRetry={pay.refetch} /></div>;
  if (code && (pay.isLoading || ['pending', 'requires_action'].includes(status))) {
    return (
      <div className={styles.page}>
        <BubbleLoader label={t('pay.result.waiting')} />
        <p className="t-body-m" role="status" style={{ textAlign: 'center' }}>{t('pay.result.waiting')}</p>
        {status === 'requires_action' && <Button variant="tertiary" onClick={cancel}>{t('pay.result.giveUp')}</Button>}
      </div>
    );
  }

  const ok = trial || status === 'succeeded';
  if (!ok) {
    const reason = pay.data?.failureReasonKey || 'billing.failure.generic';
    return (
      <div className={styles.page}>
        <Card className="stack" role="alert">
          <XCircle size={40} aria-hidden />
          <h1 className="t-heading-1">{t('pay.result.failTitle')}</h1>
          <p className="t-body-m">{t(reason)}</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {pay.data?.priceKey && <Button onClick={() => nav(path(Routes.checkout, { priceKey: pay.data.priceKey }))}>{t('pay.result.retry')}</Button>}
            <Button variant="secondary" onClick={() => nav(Routes.plans)}>{t('pay.result.otherPlan')}</Button>
          </div>
        </Card>
      </div>
    );
  }
  const e = ent.data;
  return (
    <div className={styles.page}>
      <Card tone="accent" className="stack">
        <CheckCircle2 size={40} aria-hidden />
        <h1 className="t-heading-1">{t(trial ? 'pay.result.trialTitle' : 'pay.result.okTitle')}</h1>
        <p className="t-body-m">{e?.planName ? t('pay.result.plan', { plan: e.planName }) : ''}{e?.validUntil ? ` ${t('pay.result.until', { date: dayjs(e.validUntil).format('D MMMM YYYY') })}` : ''}</p>
        {pay.data && <p className="t-body-s muted tnum">{t('pay.result.paid', { amount: money(pay.data.amount, pay.data.currency) })}{pay.data.card ? ` · ${pay.data.card.brand} •••• ${pay.data.card.last4}` : ''}</p>}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button onClick={() => nav(Routes.today)}>{t('pay.result.start')}</Button>
          <Button variant="secondary" onClick={() => nav(Routes.meSubscription)}>{t('pay.result.manage')}</Button>
        </div>
      </Card>
    </div>
  );
}
