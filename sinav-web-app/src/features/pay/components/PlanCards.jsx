import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import classNames from 'classnames';
import Routes, { path } from '@shared/constant/route-paths';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import Button from '@components/Button/Button';
import { FEATURES, money } from '../utils';
import FeatureValue from './FeatureValue';
import styles from './PlanCards.module.scss';

const intervalLabel = (price) => (price.interval === 'month' ? 'pay.per.month' : price.interval === 'year' ? 'pay.per.year' : 'pay.per.once');

// PAY-01/PAY-03: plan kartları. Veri: GET /public/products (+ /entitlements ile mevcut plan/deneme hakkı).
export default function PlanCards({ products, entitlements, loggedIn }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const current = entitlements?.productKey;
  const trial = entitlements?.trial;
  return (
    <div className={styles.grid}>
      {products.map((p) => {
        const price = p.prices[0];
        const free = p.tier === 'free';
        const isCurrent = current === p.productKey;
        const canTrial = !free && p.trialDays > 0 && trial?.eligible && trial.productKey === p.productKey;
        const go = (opts) => (loggedIn ? nav(path(Routes.checkout, { priceKey: price.priceKey }) + (opts?.trial ? '?trial=1' : '')) : nav(Routes.signUp));
        return (
          <Card key={p.productKey} className={classNames(styles.plan, p.recommended && styles.rec)} tone={p.recommended ? 'accent' : 'default'} aria-label={p.name}>
            <div className="row">
              <h3 className="t-heading-3 grow">{p.name}</h3>
              {p.recommended && <Chip size="sm" tone="reward">{t('pay.badge.recommended')}</Chip>}
              {p.badgeKey === 'founder' && <Chip size="sm" tone="reward">{t('pay.badge.founder')}</Chip>}
              {isCurrent && <Chip size="sm" selected>{t('pay.current')}</Chip>}
            </div>
            {p.description && <p className="muted t-body-s">{p.description}</p>}
            <p className="t-display-m tnum">{free ? money(0) : money(price.amount, price.currency)}<span className="t-body-s muted"> {t(intervalLabel(price))}</span></p>
            {!free && price.monthlyEquivalent > 0 && price.interval !== 'month' && (price.periodMonths ?? 12) > 1 && <p className="t-body-s muted tnum">{t('pay.monthlyEq', { amount: money(price.monthlyEquivalent) })}{price.periodEndsAt ? ` · ${t('pay.validUntil', { date: dayjs(price.periodEndsAt).format('D MMMM YYYY') })}` : ''}</p>}
            {price.campaign && <p className="t-caption tnum">{t('pay.campaign.left', { n: price.campaign.remaining, total: price.campaign.capacity })}</p>}
            <ul className={styles.feat}>
              {FEATURES.map((k) => {
                const f = p.features.find((x) => x.feature === k);
                return <li key={k}><span className="grow">{t(`pay.feature.name.${k}`)}</span><FeatureValue feature={f} /></li>;
              })}
            </ul>
            <div className="stack-sm">
              {free ? (
                <Button variant="secondary" block disabled>{isCurrent ? t('pay.current') : t('pay.freeNote')}</Button>
              ) : isCurrent ? (
                <Button variant="secondary" block disabled>{t('pay.current')}</Button>
              ) : (
                <>
                  {canTrial && <Button block onClick={() => go({ trial: true })}>{t('pay.trial.cta', { n: p.trialDays })}</Button>}
                  <Button block variant={canTrial ? 'secondary' : p.recommended ? 'primary' : 'secondary'} onClick={() => go()}>{t('pay.choose')}</Button>
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
