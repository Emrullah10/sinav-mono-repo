import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import Routes from '@shared/constant/route-paths';
import styles from './CmsLayout.module.scss';

const NAV = [
  { key: 'items', to: Routes.cms },
  { key: 'new', to: Routes.cmsNew },
  { key: 'ai', to: Routes.cmsAi },
  { key: 'review', to: Routes.cmsReview },
  { key: 'reports', to: Routes.cmsReports },
  { key: 'examBuilder', to: Routes.cmsExamBuilder },
  { key: 'calendar', to: Routes.cmsCalendar },
];

// İç araç (masaüstü). Yoğun düzen; "siz" hitabı.
export default function CmsLayout() {
  const { t } = useTranslation();
  return (
    <div className={styles.cms}>
      <aside className={styles.side}>
        <div className={styles.brand}>{t('app.name')} · {t('cms.title')}</div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.key} to={n.to} end={n.to === Routes.cms} className={({ isActive }) => classNames(styles.item, isActive && styles.active)}>{t(`cms.nav.${n.key}`)}</NavLink>
          ))}
        </nav>
        <NavLink to={Routes.today} className={styles.item}>{t('cms.nav.backToApp')}</NavLink>
      </aside>
      <main className={styles.main} id="main"><Outlet /></main>
    </div>
  );
}
