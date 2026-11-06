import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BrandMark from '@components/BrandMark/BrandMark';
import LanguageSwitch from '@components/LanguageSwitch/LanguageSwitch';
import styles from '../Help.module.scss';

// Yardım sayfalarının çerçevesi: marka (ana sayfaya döner) + dil seçici + içerik.
export default function HelpShell({ children }) {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link to="/" className={styles.brand}><BrandMark size={28} />{t('app.name')}</Link>
        <LanguageSwitch />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
