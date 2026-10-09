import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import { useAuthStore, isGuestUser } from '@store/authStore';
import Routes, { path } from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Banner from '@components/Banner/Banner';
import Card from '@components/Card/Card';
import Button from '@components/Button/Button';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import Markdown from '@components/Markdown/Markdown';
import ErrorState from '@components/ErrorState/ErrorState';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import PlanCards from '../components/PlanCards';
import { money } from '../utils';
import styles from './Premium.module.scss';

function Campaign({ campaignKey }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const q = useApiQuery(['pay', 'campaign', campaignKey], () => api.billingPublicCampaignGet(campaignKey), { retry: false });
  if (q.isLoading) return <SkeletonList rows={2} height={120} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const c = q.data;
  return (
    <Card tone="reward" className="stack">
      <h2 className="t-heading-2">{c.name}</h2>
      <p className="tnum">{t('pay.campaign.left', { n: c.remaining, total: c.capacity })}</p>
      <ProgressBar value={(c.sold / c.capacity) * 100} tone="reward" label={c.name} />
      <p className="t-body-s muted">{t('pay.campaign.launch', { date: dayjs(c.launchDate).format('D MMMM YYYY') })}</p>
      {c.termsMd && <Markdown source={c.termsMd} />}
      {c.prices.map((p) => (
        <Button key={p.priceKey} size="lg" disabled={!c.open} onClick={() => nav(path(Routes.checkout, { priceKey: p.priceKey }), { state: { price: p, productName: p.productName } })}>
          {c.open ? t('pay.campaign.buy', { price: money(p.amount) }) : c.soldOut ? t('pay.campaign.soldOut') : t('pay.campaign.closed')}
        </Button>
      ))}
    </Card>
  );
}

// PAY-01/02/10: paywall. Plan listesi + (isteğe bağlı) bağlamsal kota uyarısı (?feature=) + kampanya (?campaign=).
export default function Premium() {
  const { t } = useTranslation();
  const [sp] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const guest = isGuestUser(user);
  const products = useApiQuery(['pay', 'products'], () => api.billingPublicProductsList());
  const ent = useApiQuery(['pay', 'entitlements'], () => api.billingEntitlementsGet(), { enabled: !guest });
  const feature = sp.get('feature');
  const f = ent.data?.features?.[feature];
  const campaign = sp.get('campaign');

  return (
    <div className={styles.page}>
      <PageHeader title={t('pay.hero.title')} subtitle={products.data?.nextExam ? t('pay.hero.subtitleExam', { date: dayjs(products.data.nextExam.examDate).format('D MMMM YYYY'), months: products.data.nextExam.months }) : t('pay.hero.subtitle')} />
      {f && f.enabled && f.limit != null && f.remaining === 0 && <Banner tone="accent" title={t('pay.quota.title')}>{t('pay.quota.body', { feature: t(`pay.feature.name.${feature}`), limit: f.limit })}</Banner>}
      {ent.data?.trial?.active && <Banner tone="info">{t('pay.trial.active', { n: ent.data.trial.daysLeft })}</Banner>}
      {campaign && <Campaign campaignKey={campaign} />}
      {products.isLoading && <SkeletonList rows={3} height={200} />}
      {products.isError && <ErrorState error={products.error} onRetry={products.refetch} />}
      {products.data && <PlanCards products={products.data.products} entitlements={ent.data} loggedIn={!guest} />}
      <p className="t-caption muted">{t('pay.vatNote')}</p>
      <Button variant="tertiary" onClick={() => window.history.back()}>{t('common.back')}</Button>
    </div>
  );
}
