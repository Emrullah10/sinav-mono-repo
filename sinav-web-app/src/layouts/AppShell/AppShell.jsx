import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, BookOpen, ClipboardList, MessagesSquare, User, Bell } from 'lucide-react';
import classNames from 'classnames';
import Routes from '@shared/constant/route-paths';
import { useAuthStore, isGuestUser } from '@store/authStore';
import IconButton from '@components/IconButton/IconButton';
import Avatar from '@components/Avatar/Avatar';
import styles from './AppShell.module.scss';

const NAV = [
  { key: 'today', to: Routes.today, icon: Sun },
  { key: 'study', to: Routes.study, icon: BookOpen },
  { key: 'exams', to: Routes.exams, icon: ClipboardList },
  { key: 'tutor', to: Routes.tutor, icon: MessagesSquare },
  { key: 'me', to: Routes.me, icon: User },
];

// Telefon: alt sekme çubuğu (etiket hep görünür) · tablet (md): 72px ray · masaüstü (lg): 248px kenar çubuğu.
export default function AppShell() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const name = user?.displayName || user?.email || t('nav.guest');
  return (
    <div className={styles.shell}>
      <aside className={styles.side} aria-label={t('nav.main')}>
        <div className={styles.brand}><span className={styles.logo} aria-hidden /> <span className={styles.brandText}>{t('app.name')}</span></div>
        <nav>
          {NAV.map(({ key, to, icon: Icon }) => (
            <NavLink key={key} to={to} className={({ isActive }) => classNames(styles.item, isActive && styles.active)}>
              <Icon size={22} aria-hidden /> <span>{t(`nav.${key}`)}</span>
            </NavLink>
          ))}
        </nav>
        <div className={styles.sideFoot}>
          {isGuestUser(user) && (
            <button type="button" className={styles.guestCta} onClick={() => navigate(Routes.signUp)}>{t('nav.saveProgress')}</button>
          )}
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.top}>
          <div className="grow" />
          <IconButton label={t('nav.notifications')}><Bell size={20} /></IconButton>
          <button type="button" className={styles.profile} onClick={() => navigate(Routes.me)} aria-label={t('nav.me')}>
            <Avatar name={name} size={32} />
            <span className={styles.profileName}>{name}</span>
          </button>
        </header>
        <main className={styles.content} id="main"><Outlet /></main>
      </div>
      <nav className={styles.tabs} aria-label={t('nav.main')}>
        {NAV.map(({ key, to, icon: Icon }) => (
          <NavLink key={key} to={to} className={({ isActive }) => classNames(styles.tab, isActive && styles.active)}>
            <Icon size={22} aria-hidden /> <span>{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
