import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GraduationCap, CalendarCheck, NotebookPen, Languages } from 'lucide-react';
import Button from '@components/Button/Button';
import Card from '@components/Card/Card';
import BrandMark from '@components/BrandMark/BrandMark';
import TapDemo from '../components/TapDemo';
import Routes from '@shared/constant/route-paths';
import { ensureSession } from '@shared/auth/session';
import { notify } from '@shared/utils/notify';
import { getApiErrorMessage } from '@shared/utils/apiError';
import styles from './Welcome.module.scss';

const CARDS = [
  { icon: GraduationCap, k: 'auth.welcome.card1' },
  { icon: CalendarCheck, k: 'auth.welcome.card2' },
  { icon: NotebookPen, k: 'auth.welcome.card3' },
];

// AUTH-01 (web): "Başla" misafir oturumu açar ve ONB-01'e gider.
export default function Welcome() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      await ensureSession();
      nav(Routes.onbExam);
    } catch (e) {
      notify(getApiErrorMessage(e), 'error');
      setBusy(false);
    }
  };
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <span className={styles.brand}><BrandMark size={32} />{t('app.name')}</span>
        <Button variant="tertiary" onClick={() => nav(Routes.signIn)}>{t('auth.signIn.title')}</Button>
      </header>
      <section className={styles.hero}>
        <h1 className="t-display-l">{t('auth.welcome.title')}</h1>
        <p className="t-body-l muted">{t('auth.welcome.subtitle')}</p>
        <div className={styles.actions}>
          <Button size="lg" onClick={start} loading={busy}>{t('auth.welcome.start')}</Button>
          <Button size="lg" variant="tertiary" onClick={() => nav(Routes.signIn)}>{t('auth.welcome.haveAccount')}</Button>
        </div>
        <p className="t-caption muted">{t('auth.welcome.trust')}</p>
      </section>
      <section className={styles.tap} aria-labelledby="intro-tap">
        <div className={styles.tapText}>
          <span className={styles.ico}><Languages size={24} aria-hidden /></span>
          <h2 id="intro-tap" className="t-heading-2">{t('intro.tap.title')}</h2>
          <p className="t-body-l muted">{t('intro.tap.body')}</p>
        </div>
        <TapDemo />
      </section>
      <section className={styles.cards} aria-label={t('auth.welcome.title')}>
        {CARDS.map(({ icon: I, k }) => (
          <Card key={k} className={styles.card}>
            <span className={styles.ico}><I size={24} aria-hidden /></span>
            <h2 className="t-heading-3">{t(`${k}.title`)}</h2>
            <p className="muted t-body-m">{t(`${k}.body`)}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
