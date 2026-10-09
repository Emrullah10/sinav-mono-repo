import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import IconButton from '@components/IconButton/IconButton';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import styles from './SessionTop.module.scss';

// Odak modu üst çubuğu: çık · başlık/ilerleme · sağ alan (süre vb.).
export default function SessionTop({ title, done, total, onExit, exiting, right }) {
  const { t } = useTranslation();
  const pct = total ? (done / total) * 100 : 0;
  return (
    <header className={styles.top}>
      <IconButton label={t('study.session.exit')} onClick={onExit} disabled={exiting}><X size={20} /></IconButton>
      <div className="grow">
        <p className="t-label-m">{title}</p>
        <ProgressBar value={pct} size="sm" label={`${done} / ${total}`} />
      </div>
      <span className="t-caption muted tnum">{done} / {total}</span>
      {right}
    </header>
  );
}
