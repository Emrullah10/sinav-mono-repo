import classNames from 'classnames';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { bgStyle } from '@shared/utils/backgroundStyle';
import styles from './Background.module.scss';

// Arka plan önizleme karosu: kanvas + desen + üstünde küçük bir kart taslağı (içerik desenin üstünde nasıl durur).
export default function BackgroundTile({ spec, scheme, label, premium, selected, onClick, size = 'md', role = 'radio' }) {
  const { t } = useTranslation();
  // Küçük karoda desenin birkaç tekrarı görünsün diye biraz küçültülür.
  const preview = spec ? { ...spec, scale: Math.max(0.6, spec.scale * 0.75) } : null;
  return (
    <button type="button" role={role} aria-checked={role === 'radio' ? selected : undefined} aria-pressed={role === 'radio' ? undefined : selected} className={classNames(styles.tile, styles[size], selected && styles.selected)} onClick={onClick}>
      <span className={styles.preview} style={bgStyle(preview, scheme)}>
        <span className={styles.mock} aria-hidden><i /><i /></span>
        {premium && <span className={styles.premium}>{t('bg.premium')}</span>}
        {selected && <span className={styles.check} aria-hidden><Check size={13} strokeWidth={3} /></span>}
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </button>
  );
}
