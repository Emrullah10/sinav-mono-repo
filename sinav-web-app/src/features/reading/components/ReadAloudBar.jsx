import { useTranslation } from 'react-i18next';
import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import IconButton from '@components/IconButton/IconButton';
import { READ_RATES } from '../hooks/useReadAloud';
import styles from './Reading.module.scss';

// Okuyucunun altındaki sesli okuma çubuğu: hız, önceki/sonraki cümle, oynat/duraklat, kapat.
export default function ReadAloudBar({ aloud }) {
  const { t } = useTranslation();
  const playing = aloud.status === 'playing';
  const at = Math.max(0, READ_RATES.findIndex((r) => r.value === aloud.rate));
  const rate = READ_RATES[at];
  const nextRate = READ_RATES[(at + 1) % READ_RATES.length];
  return (
    <div className={styles.aloudBar} role="region" aria-label={t('read.aloud.title')}>
      <button type="button" className={styles.aloudRate} aria-label={t('read.aloud.speed', { n: rate.label })} title={t('read.aloud.speed', { n: rate.label })} onClick={() => aloud.setRate(nextRate.value)}>
        {`${rate.label}×`}
      </button>
      <div className={styles.aloudControls}>
        <IconButton label={t('read.aloud.prev')} onClick={() => aloud.skip(-1)}><SkipBack size={20} /></IconButton>
        <IconButton tone="tonal" label={playing ? t('read.aloud.pause') : t('read.aloud.play')} onClick={aloud.toggle}>{playing ? <Pause size={20} /> : <Play size={20} />}</IconButton>
        <IconButton label={t('read.aloud.next')} onClick={() => aloud.skip(1)}><SkipForward size={20} /></IconButton>
      </div>
      <IconButton label={t('read.aloud.close')} onClick={aloud.stop}><X size={20} /></IconButton>
    </div>
  );
}
