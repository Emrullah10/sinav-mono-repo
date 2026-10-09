import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { apiErrorCode, apiErrorDetails, getApiErrorMessage } from '@shared/utils/apiError';
import { notify } from '@shared/utils/notify';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import TextInput from '@components/TextInput/TextInput';
import OptionRow from '@components/OptionRow/OptionRow';
import Banner from '@components/Banner/Banner';
import ErrorState from '@components/ErrorState/ErrorState';
import Skeleton from '@components/Skeleton/Skeleton';
import CardFields, { emptyCard, cardBody, cardValid } from '../components/CardFields';
import BillingProfileForm, { profileBody, profileToForm, profileValid, emptyProfile } from '../components/BillingProfileForm';
import { money, newKey } from '../utils';
import styles from './Checkout.module.scss';

// PAY-04: ödeme. profil → kupon → taksit → kart → onaylar → POST /checkout (Idempotency-Key). 3D Secure için actionUrl'e tam sayfa gidilir.
export default function Checkout() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { priceKey } = useParams();
  const location = useLocation();
  const [sp] = useSearchParams();
  const trial = sp.get('trial') === '1';

  const products = useApiQuery(['pay', 'products'], () => api.billingPublicProductsList());
  const profileQ = useApiQuery(['pay', 'profile'], () => api.billingProfileGet());
  const findPrice = () => {
    if (location.state?.price) return { product: { name: location.state.productName || location.state.price.productName || priceKey, trialDays: 0 }, price: location.state.price };
    for (const p of products.data?.products || []) { const pr = p.prices.find((x) => x.priceKey === priceKey); if (pr) return { product: p, price: pr }; }
    return {};
  };
  const { product, price } = findPrice();

  const [profile, setProfile] = useState(emptyProfile);
  const [card, setCard] = useState(emptyCard);
  const [coupon, setCoupon] = useState('');
  const [couponRes, setCouponRes] = useState(null);
  const [count, setCount] = useState(1);
  const [preInfo, setPreInfo] = useState(false);
  const [distance, setDistance] = useState(false);
  const [error, setError] = useState(null);
  const key = useRef(newKey());

  useEffect(() => { if (profileQ.data) setProfile(profileToForm(profileQ.data.profile, profileQ.data.prefill)); }, [profileQ.data]);

  const bin = card.number.replace(/\s/g, '').slice(0, 8);
  const inst = useApiQuery(['pay', 'installments', priceKey, bin.length >= 6 ? bin.slice(0, 6) : '', couponRes?.valid ? couponRes.couponCode : ''],
    () => api.billingInstallmentsList({ priceKey, bin: bin.slice(0, 6), ...(couponRes?.valid ? { couponCode: couponRes.couponCode } : {}) }), { enabled: !!price && !trial && bin.length >= 6, retry: false });
  useEffect(() => { if (inst.data && !inst.data.options.some((o) => o.count === count)) setCount(1); }, [inst.data, count]);

  const validate = useApiMutation(() => api.billingCouponValidate({ couponCode: coupon.trim(), priceKey }), { onSuccess: setCouponRes });

  const total = couponRes?.valid ? couponRes.total : price?.amount;
  const discount = couponRes?.valid ? couponRes.discountAmount : 0;

  const pay = useApiMutation(() => {
    const body = {
      priceKey, acceptPreInfo: preInfo, acceptDistanceSales: distance, billingProfile: profileBody(profile),
      ...(trial ? { startTrial: true } : { installmentCount: count }),
      ...(couponRes?.valid ? { couponCode: couponRes.couponCode } : {}),
      ...(cardValid(card) ? { card: cardBody(card) } : {}),
    };
    return api.billingCheckout(body, { headers: { 'Idempotency-Key': key.current } });
  }, {
    onSuccess: (d) => {
      if (d.status === 'requires_action' && d.actionUrl) { window.location.href = d.actionUrl; return; }
      if (d.status === 'trialing') return nav(`${Routes.checkoutResult}?trial=1`, { replace: true });
      nav(`${Routes.checkoutResult}?payment=${d.paymentCode}`, { replace: true });
    },
    onError: (e) => {
      const code = apiErrorCode(e);
      if (code === 'BILLING_CHECKOUT_IN_PROGRESS') {
        const d = apiErrorDetails(e);
        if (d?.actionUrl) { window.location.href = d.actionUrl; return; }
      }
      key.current = newKey(); // yeni deneme = yeni anahtar
      setError(e);
      notify(getApiErrorMessage(e), 'error');
    },
  });

  if (products.isError) return <div className={styles.page}><ErrorState error={products.error} onRetry={products.refetch} /></div>;
  if (products.isLoading || profileQ.isLoading) return <div className={styles.page}><Skeleton height={400} radius={16} /></div>;
  if (!price) return <div className={styles.page}><ErrorState error={{ response: { data: { error: { code: 'PRICE_NOT_FOUND' } } } }} onRetry={() => nav(Routes.plans)} /></div>;

  const cardOk = trial ? (card.number === '' || cardValid(card)) : cardValid(card) || total === 0;
  const canPay = profileValid(profile) && preInfo && distance && cardOk;
  const legal = (type, label) => <Link to={path(Routes.legal, { type })} target="_blank" rel="noopener noreferrer">{label}</Link>;

  return (
    <div className={styles.page}>
      <PageHeader eyebrow={t('pay.checkout.eyebrow')} title={t(trial ? 'pay.checkout.trialTitle' : 'pay.checkout.title')} actions={<Button variant="tertiary" onClick={() => nav(Routes.plans)}>{t('pay.checkout.backToPlans')}</Button>} />
      <div className={styles.grid}>
        <div className="stack">
          <Card className="stack-sm"><h2 className="t-heading-3">{t('pay.checkout.billing')}</h2>
            <BillingProfileForm value={profile} onChange={setProfile} maskedNationalId={profileQ.data?.profile?.nationalIdMasked} disabled={pay.isPending} />
          </Card>
          {!trial && (
            <Card className="stack-sm"><h2 className="t-heading-3">{t('pay.checkout.coupon')}</h2>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <TextInput className="grow" label={t('pay.checkout.couponLabel')} value={coupon} onChange={(e) => { setCoupon(e.target.value); setCouponRes(null); }} />
                <Button variant="secondary" disabled={!coupon.trim()} loading={validate.isPending} onClick={() => validate.mutate()}>{t('pay.checkout.apply')}</Button>
              </div>
              {couponRes && (couponRes.valid ? <Banner tone="success">{t('pay.checkout.couponOk', { amount: money(couponRes.discountAmount) })}</Banner> : <Banner tone="warning">{t(couponRes.reasonKey)}</Banner>)}
            </Card>
          )}
          <Card className="stack-sm"><h2 className="t-heading-3">{trial ? t('pay.checkout.cardOptional') : t('pay.checkout.card')}</h2>
            {trial && <p className="muted t-body-s">{t('pay.checkout.trialCardNote')}</p>}
            <CardFields value={card} onChange={setCard} disabled={pay.isPending} />
            <p className="t-caption muted row"><Lock size={14} aria-hidden /> {t('pay.checkout.secure')}</p>
            {!trial && (
              <div className="stack-sm" role="radiogroup" aria-label={t('pay.checkout.installments')}>
                <h3 className="t-title">{t('pay.checkout.installments')}</h3>
                {bin.length < 6 && <p className="muted t-body-s">{t('pay.checkout.installmentsHint')}</p>}
                {(inst.data?.options || (bin.length >= 6 ? [{ count: 1, perInstallment: total, total, interestRate: 0 }] : [])).map((o) => (
                  <OptionRow key={o.count} letter={String(o.count)} lang="tr" state={count === o.count ? 'selected' : 'default'} onClick={() => setCount(o.count)}>
                    {o.count === 1 ? t('pay.checkout.single', { total: money(o.total) }) : t('pay.checkout.multi', { n: o.count, each: money(o.perInstallment), total: money(o.total) })}
                  </OptionRow>
                ))}
              </div>
            )}
          </Card>
        </div>

        <aside className="stack">
          <Card tone="accent" className="stack-sm">
            <h2 className="t-heading-3">{product?.name}</h2>
            <dl className={styles.sum}>
              <div><dt>{t('pay.checkout.list')}</dt><dd className="tnum">{money(price.amount, price.currency)}</dd></div>
              {discount > 0 && <div><dt>{t('pay.checkout.discount')}</dt><dd className="tnum">-{money(discount)}</dd></div>}
              {trial ? (
                <div className={styles.total}><dt>{t('pay.checkout.today')}</dt><dd className="tnum">{money(0)}</dd></div>
              ) : (
                <div className={styles.total}><dt>{t('pay.checkout.total')}</dt><dd className="tnum">{money(total, price.currency)}</dd></div>
              )}
            </dl>
            <p className="t-caption muted">{trial ? t('pay.checkout.trialAfter', { n: product?.trialDays, amount: money(price.amount) }) : t('pay.checkout.vat')}</p>
          </Card>
          <Card className="stack-sm">
            <label className={styles.check}><input type="checkbox" checked={preInfo} onChange={(e) => setPreInfo(e.target.checked)} /><span>{t('pay.checkout.acceptPre')} {legal('pre_information', t('pay.checkout.preLink'))}</span></label>
            <label className={styles.check}><input type="checkbox" checked={distance} onChange={(e) => setDistance(e.target.checked)} /><span>{t('pay.checkout.acceptDistance')} {legal('distance_sales', t('pay.checkout.distanceLink'))}</span></label>
            {error && <Banner tone="error">{getApiErrorMessage(error)}</Banner>}
            <Button size="lg" block startIcon={<Lock size={18} />} disabled={!canPay} loading={pay.isPending} onClick={() => pay.mutate()}>
              {trial ? t('pay.checkout.startTrial') : t('pay.checkout.pay', { amount: money(total, price.currency) })}
            </Button>
            <p className="t-caption muted">{t('pay.checkout.threeDs')}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
