import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, X } from 'lucide-react';
import styles from './UpdateNotice.module.scss';

const CURRENT = typeof __APP_VERSION__ === 'undefined' ? null : __APP_VERSION__;
const EVERY_MS = 5 * 60 * 1000;

/**
 * Yeni sürüm uyarısı: derleme `version.json` yazar (vite.config); açık sekme birkaç dakikada bir ve sekmeye dönünce bakar.
 * Sürüm değiştiyse üst ortada "Yeni sürüm hazır · Yenile". Kapatılırsa aynı sürüm için bir daha gösterilmez.
 */
export default function UpdateNotice() {
  const { t } = useTranslation();
  const [latest, setLatest] = useState(null);
  const [dismissed, setDismissed] = useState(null);

  useEffect(() => {
    if (!import.meta.env.PROD || !CURRENT || CURRENT === 'unknown') return undefined;
    let stop = false;
    const check = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const v = (await res.json())?.version;
        if (!stop && v && v !== CURRENT) setLatest(v);
      } catch { /* çevrimdışı: sonra yine denenir */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const id = setInterval(check, EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  if (!latest || dismissed === latest) return null;
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.pill}>
        <span className={styles.dot} aria-hidden />
        <span className={styles.text}>
          <strong>{t('update.title')}</strong>
          <span className={styles.sub}>{t('update.body')}</span>
        </span>
        <button type="button" className={styles.reload} onClick={() => window.location.reload()}>
          <RefreshCw size={16} aria-hidden />{t('update.reload')}
        </button>
        <button type="button" className={styles.close} onClick={() => setDismissed(latest)} aria-label={t('update.later')} title={t('update.later')}>
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}
