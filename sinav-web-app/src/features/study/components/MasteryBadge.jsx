import { useTranslation } from 'react-i18next';
import Chip from '@components/Chip/Chip';
import ProgressBar from '@components/ProgressBar/ProgressBar';

const TONE = { new: 'default', learning: 'warning', developing: 'accent', good: 'success', strong: 'success' };

// Ustalık: seviye etiketi + çubuk + 7 günlük değişim (veri yoksa gösterilmez).
export default function MasteryBadge({ level, mastery, change7d, label }) {
  const { t } = useTranslation();
  return (
    <div className="stack-sm" style={{ gap: 'var(--space-2)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Chip size="sm" tone={TONE[level] || 'default'}>{t(`study.level.${level}`)}</Chip>
        <span className="t-caption muted tnum">{level === 'new' ? t('study.masteryNew') : t('study.mastery', { n: Math.round(mastery) })}{change7d != null && ` · ${t('study.change7d', { n: `${change7d > 0 ? '+' : ''}${Math.round(change7d)}` })}`}</span>
      </div>
      <ProgressBar value={mastery} size="sm" label={label || t('study.mastery', { n: Math.round(mastery) })} />
    </div>
  );
}
