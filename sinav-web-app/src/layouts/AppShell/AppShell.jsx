import { Link, NavLink, Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, BookOpen, ClipboardList, MessagesSquare, User, Bell, LifeBuoy, Settings, Sparkles } from 'lucide-react';
import classNames from 'classnames';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import Routes from '@shared/constant/route-paths';
import { useAuthStore, isGuestUser } from '@store/authStore';
import IconButton from '@components/IconButton/IconButton';
import Avatar from '@components/Avatar/Avatar';
import BrandMark from '@components/BrandMark/BrandMark';
import FeedbackButton from '@features/feedback/FeedbackButton';
import ThemeToggle from './ThemeToggle';
import AppBackground from './AppBackground';
import styles from './AppShell.module.scss';

// Ana bölümler: telefonda alt sekme çubuğu, tablette ray, masaüstünde kenar çubuğu — üçü de aynı beş bölüm.
const NAV = [
  { key: 'today', to: Routes.today, icon: Sun },
  { key: 'study', to: Routes.study, icon: BookOpen },
  { key: 'exams', to: Routes.exams, icon: ClipboardList },
  { key: 'tutor', to: Routes.tutor, icon: MessagesSquare },
  { key: 'me', to: Routes.me, icon: User },
];

// Yalnız masaüstü (lg) kenar çubuğunda, bölümün altında görünen sayfalar. Etiket = gidilen sayfanın başlığı.
// count: çalışma özetinden "tekrar bekleyen" sayısı (Çalış sayfasıyla aynı sorgu, ek istek yok).
const SUB = {
  study: [
    { to: Routes.vocab, label: 'study.vocab.title', count: (o) => o?.vocab?.dueCards },
    { to: Routes.mistakes, label: 'study.mistakes.title', count: (o) => o?.mistakes?.due },
    { to: Routes.library, label: 'read.library.title' },
  ],
  tutor: [{ to: Routes.translation, label: 'tutor.tr.title' }],
};

// Kenar çubuğunun dibi. parent: telefonda/tablette bu sayfadayken hangi ana bölüm seçili görünsün.
const FOOT = [
  { to: Routes.help, label: 'help.title', icon: LifeBuoy },
  { to: Routes.meSettings, label: 'me.nav.settings', icon: Settings, parent: 'me' },
];

const countText = (n) => (n > 99 ? '99+' : String(n));

// Telefon: alt sekme çubuğu (etiket hep görünür) · tablet (md): 72px ray · masaüstü (lg): 248px kenar çubuğu.
export default function AppShell() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const name = user?.displayName || user?.email || t('nav.guest');
  const guest = isGuestUser(user);

  const overview = useApiQuery(['learning', 'study', 'overview'], () => api.learningStudyOverviewGet(), {
    enabled: status === 'authenticated',
    staleTime: 60_000,
    meta: { suppressGlobalErrorNotification: true },
  });
  const o = overview.data;
  const usage = o?.usage;
  const freePlan = !guest && typeof usage?.limit === 'number' && usage.limit > 0;

  // Alt sayfadayken ana bölüm "üst" olarak işaretlenir (masaüstünde vurgu alt sayfada, telefonda/tablette sekmede).
  const on = (to) => Boolean(matchPath({ path: to, end: false }, pathname));
  const childOn = (key) => (SUB[key] || []).some((s) => on(s.to)) || FOOT.some((f) => f.parent === key && on(f.to));

  return (
    <div className={styles.shell}>
      <AppBackground />
      <aside className={styles.side} aria-label={t('nav.main')}>
        <div className={styles.brand}><BrandMark size={30} /><span className={styles.brandText}>{t('app.name')}</span></div>
        <nav className={styles.nav}>
          {NAV.map(({ key, to, icon: Icon }) => (
            <div key={key} className={styles.group}>
              <NavLink
                to={to}
                className={({ isActive }) => classNames(styles.item, childOn(key) ? styles.parent : isActive && styles.active)}
              >
                <Icon size={22} aria-hidden /> <span>{t(`nav.${key}`)}</span>
              </NavLink>
              {SUB[key] && (
                <div className={styles.sub}>
                  {SUB[key].map((s) => {
                    const n = s.count?.(o) || 0;
                    return (
                      <NavLink key={s.to} to={s.to} className={({ isActive }) => classNames(styles.subItem, isActive && styles.active)}>
                        <span className={styles.subLabel}>{t(s.label)}</span>
                        {n > 0 && (
                          <span className={styles.count}>
                            <span aria-hidden>{countText(n)}</span>
                            <span className="sr-only">{t('nav.due', { n })}</span>
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className={styles.sideFoot}>
          {guest && (
            <button type="button" className={styles.guestCta} onClick={() => navigate(Routes.signUp)}>{t('nav.saveProgress')}</button>
          )}
          {freePlan && (
            <div className={styles.plan}>
              <span className={styles.planLabel}>{t('nav.plan.free')}</span>
              <div className={styles.planRow}>
                <span>{t('nav.plan.left')}</span>
                <span className={styles.planNum}>{usage.remaining}/{usage.limit}</span>
              </div>
              <div className={styles.planBar} aria-hidden><span style={{ width: `${Math.round((usage.remaining / usage.limit) * 100)}%` }} /></div>
              <Link to={Routes.premium} className={styles.planCta}><Sparkles size={16} aria-hidden />{t('nav.plan.cta')}</Link>
            </div>
          )}
          <div className={styles.footLinks}>
            {FOOT.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => classNames(styles.item, styles.footItem, isActive && styles.active)}>
                <Icon size={20} aria-hidden /> <span>{t(label)}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.top}>
          <div className="grow" />
          <ThemeToggle />
          <FeedbackButton />
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
          <NavLink key={key} to={to} className={({ isActive }) => classNames(styles.tab, (isActive || childOn(key)) && styles.active)}>
            <Icon size={22} aria-hidden /> <span>{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
