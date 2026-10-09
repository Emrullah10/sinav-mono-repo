import { useTranslation } from 'react-i18next';
import { Check, Minus, Infinity as Inf } from 'lucide-react';
import { featureValue } from '../utils';

// Tek özellik değeri: renk + ikon + metin (renk tek başına anlam taşımaz).
export default function FeatureValue({ feature }) {
  const { t } = useTranslation();
  const v = featureValue(feature);
  if (v.kind === 'no') return <span className="muted row"><Minus size={16} aria-hidden /> {t('pay.feature.no')}</span>;
  if (v.kind === 'yes') return <span className="row"><Check size={16} aria-hidden /> {t('pay.feature.yes')}</span>;
  if (v.kind === 'unlimited') return <span className="row"><Inf size={16} aria-hidden /> {t('pay.feature.unlimited')}</span>;
  return <span className="row tnum"><Check size={16} aria-hidden /> {t(`pay.feature.limit.${v.period || 'none'}`, { n: v.limit })}</span>;
}
