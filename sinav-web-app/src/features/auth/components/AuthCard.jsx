import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitch from '@components/LanguageSwitch/LanguageSwitch';
import styles from './AuthCard.module.scss';

// Kimlik ekranlarının ortak çerçevesi: kelime markası + başlık + alt başlık + içerik.
export default function AuthCard({ title, subtitle, back, children, footer }) {
  const { t } = useTranslation();
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <Link to="/" className={styles.brand}>{t('app.name')}</Link>
        <LanguageSwitch />
      </div>
      {back}
      <h1 className="t-display-m">{title}</h1>
      {subtitle && <p className="muted t-body-l">{subtitle}</p>}
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
