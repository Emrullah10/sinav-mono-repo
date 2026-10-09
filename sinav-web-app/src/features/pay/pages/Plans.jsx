import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import { useAuthStore, isGuestUser } from '@store/authStore';
import PageHeader from '@components/PageHeader/PageHeader';
import ErrorState from '@components/ErrorState/ErrorState';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import PlanCards from '../components/PlanCards';
import FeatureValue from '../components/FeatureValue';
import { FEATURES } from '../utils';
import styles from './Premium.module.scss';

// PAY-03: plan karşılaştırma. GET /public/products
export default function Plans() {
  const { t } = useTranslation();
  const guest = isGuestUser(useAuthStore((s) => s.user));
  const products = useApiQuery(['pay', 'products'], () => api.billingPublicProductsList());
  const ent = useApiQuery(['pay', 'entitlements'], () => api.billingEntitlementsGet(), { enabled: !guest });
  if (products.isError) return <div className={styles.page}><ErrorState error={products.error} onRetry={products.refetch} /></div>;
  const list = products.data?.products || [];
  return (
    <div className={styles.page}>
      <PageHeader title={t('pay.plans.title')} subtitle={t('pay.plans.subtitle')} />
      {products.isLoading && <SkeletonList rows={3} height={200} />}
      {products.data && (
        <>
          <PlanCards products={list} entitlements={ent.data} loggedIn={!guest} />
          <section className="stack-sm" aria-label={t('pay.plans.compare')}>
            <h2 className="t-heading-2">{t('pay.plans.compare')}</h2>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead><tr><th scope="col">{t('pay.plans.feature')}</th>{list.map((p) => <th key={p.productKey} scope="col">{p.name}</th>)}</tr></thead>
                <tbody>
                  {FEATURES.map((k) => (
                    <tr key={k}>
                      <th scope="row">{t(`pay.feature.name.${k}`)}</th>
                      {list.map((p) => <td key={p.productKey}><FeatureValue feature={p.features.find((x) => x.feature === k)} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
