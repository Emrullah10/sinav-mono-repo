import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import IconButton from '@components/IconButton/IconButton';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import styles from './Top.module.scss';

// Odak modu üst çubuğu: çık · ilerleme.
export default function Top({ title, answered, total, onExit, exiting }) {
  const { t } = useTranslation();
  const pct = total ? (answered / total) * 100 : 0;
  return (
    <header className={styles.top}>
      <IconButton label={t('diag.exit')} onClick={onExit} disabled={exiting}><X size={20} /></IconButton>
      <div className="grow">
        <p className="t-label-m">{title}</p>
        <ProgressBar value={pct} size="sm" label={t('diag.progress', { done: answered, total })} />
      </div>
      <span className="t-caption muted tnum">{t('diag.progress', { done: answered, total })}</span>
    </header>
  );
}
