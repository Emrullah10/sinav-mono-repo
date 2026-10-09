import { useTranslation } from 'react-i18next';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import Skeleton from '@components/Skeleton/Skeleton';
import ErrorState from '@components/ErrorState/ErrorState';
import EmptyState from '@components/EmptyState/EmptyState';
import SysShell from '../components/SysShell';
import s from '../components/Sys.module.scss';

const money = (amount, cur) => (cur === 'TRY' ? `${Number(amount).toLocaleString('tr-TR')} TL` : `${Number(amount).toLocaleString('tr-TR')} ${cur}`);

// Planlar ve haklar (salt okunur). GET /billing/public/products — yönetim yazma uçları henüz yok.
export default function Plans() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useApiQuery(['billing', 'products'], () => api.billingPublicProductsList());
  return (
    <SysShell title={t('sysx.plans.title')} subtitle={t('sysx.plans.subtitle')}>
      {isLoading && <Skeleton height={240} />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data?.products.length === 0 && <EmptyState title={t('sysx.plans.empty')} />}
      <div className={s.grid}>
        {data?.products.map((p) => (
          <Card key={p.productKey} tone={p.recommended ? 'accent' : 'default'}>
            <div className="stack-sm">
              <div className="row"><h2 className="t-heading-3 grow">{p.name}</h2><Chip size="sm" tone={p.tier === 'premium' ? 'accent' : 'default'}>{t(`sysx.plans.tier.${p.tier}`)}</Chip></div>
              <p className="muted t-body-s">{p.productKey} · {t(`sysx.plans.kind.${p.kind}`, { defaultValue: p.kind })}{p.trialDays ? ` · ${t('sysx.plans.trial', { n: p.trialDays })}` : ''}</p>
              {p.prices.map((pr) => (
                <p key={pr.priceKey} className="t-title tnum">{money(pr.amount, pr.currency)} <span className="muted t-body-s">· {pr.priceKey} · {t(`sysx.plans.interval.${pr.interval}`, { defaultValue: pr.interval })}{pr.campaign ? ` · ${pr.campaign.name}` : ''}</span></p>
              ))}
              <ul className="t-body-s" style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
                {p.features.map((f) => (
                  <li key={f.feature}>{t(`sysx.plans.feature.${f.feature}`, { defaultValue: f.feature })}: {!f.enabled ? t('sysx.plans.off') : f.limit == null ? t('sysx.plans.unlimited') : `${f.limit}${f.period ? ` / ${t(`sysx.plans.period.${f.period}`)}` : ''}`}</li>
                ))}
              </ul>
            </div>
          </Card>
        ))}
      </div>
    </SysShell>
  );
}
