import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react';
import Card from '@components/Card/Card';
import styles from './ScoreBandCard.module.scss';

const num = (n, lng) => Number(n).toLocaleString(lng?.startsWith('en') ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 1 });

// Puan tahmini her zaman aralık olarak gösterilir (tek rakam yok).
export default function ScoreBandCard({ estimate, enrollment, requiredCorrect }) {
  const { t, i18n } = useTranslation();
  const max = estimate?.scoreMax || enrollment?.scoreMax || 100;
  const target = enrollment?.targetScore;
  const pc = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <Card>
      <div className="stack-sm">
        <h2 className="t-heading-3 row"><Flag size={18} aria-hidden /> {t('home.estimate.title')}</h2>
        {enrollment?.daysToExam != null && <p className="t-caption muted">{t('home.daysToExam', { n: enrollment.daysToExam })}</p>}
        {estimate ? (
          <>
            <p className="t-caption muted">{t('home.estimate.range')}</p>
            <p className="t-numeric-m tnum">{t('home.estimate.rangeValue', { low: num(estimate.low, i18n.language), high: num(estimate.high, i18n.language) })}</p>
            <div className={styles.band} role="img" aria-label={t('home.estimate.bandLabel', { low: num(estimate.low, i18n.language), high: num(estimate.high, i18n.language), target: target ?? '-' })}>
              <span className={styles.range} style={{ left: pc(estimate.low), width: `calc(${pc(estimate.high)} - ${pc(estimate.low)})` }} />
              {target != null && <span className={styles.target} style={{ left: pc(target) }} />}
            </div>
            <div className={styles.scale} aria-hidden><span>0</span><span>{max}</span></div>
            {target != null && <p className="t-body-s">{t('home.estimate.target', { score: target })}</p>}
            {requiredCorrect != null && estimate.estimatedCorrect && <p className="t-body-s muted">{t('home.estimate.needed', { n: requiredCorrect, low: estimate.estimatedCorrect.low, high: estimate.estimatedCorrect.high })}</p>}
            {estimate.confidence < 0.8 && <p className="t-caption muted">{t('home.estimate.lowConf')}</p>}
          </>
        ) : <p className="muted t-body-s">{t('home.estimate.none')}</p>}
      </div>
    </Card>
  );
}
