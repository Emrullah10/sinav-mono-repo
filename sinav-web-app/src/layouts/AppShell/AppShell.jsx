import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sun, BookOpen, ClipboardList, MessagesSquare, User, Bell, LifeBuoy, Settings, Sparkles, Menu, X, ChevronRight, Layers, NotebookPen, Library, Languages, Crown } from 'lucide-react';
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

// Ana bölümler (beş): telefonda alt sekme çubuğu, yatay tablette etiketli ray, masaüstünde kenar çubuğu.
// tint: bölümün ikon kutusu rengi (tasarım belirteçlerindeki renk tonları).
const NAV = [
  { key: 'today', to: Routes.today, icon: Sun, tint: 'amber' },
  { key: 'study', to: Routes.study, icon: BookOpen, tint: 'teal' },
  { key: 'exams', to: Routes.exams, icon: ClipboardList, tint: 'indigo' },
  { key: 'tutor', to: Routes.tutor, icon: MessagesSquare, tint: 'plum' },
  { key: 'me', to: Routes.me, icon: User, tint: 'neutral' },
];

// Bölümün altındaki sayfalar (kenar çubuğunda ve çekmecede). Etiket = gidilen sayfanın başlığı.
// count: çalışma özetinden "tekrar bekleyen" sayısı (Çalış sayfasıyla aynı sorgu, ek istek yok).
const SUB = {
  study: [
    { to: Routes.vocab, label: 'study.vocab.title', icon: Layers, count: (o) => o?.vocab?.dueCards },
    { to: Routes.mistakes, label: 'study.mistakes.title', icon: NotebookPen, count: (o) => o?.mistakes?.due },
    { to: Routes.library, label: 'read.library.title', icon: Library },
  ],
  tutor: [{ to: Routes.translation, label: 'tutor.tr.title', icon: Languages }],
};

// Kenar çubuğunun dibi. parent: bu sayfadayken hangi ana bölüm seçili görünsün.
const FOOT = [
  { to: Routes.help, label: 'help.title', icon: LifeBuoy },
  { to: Routes.meSettings, label: 'me.nav.settings', icon: Settings, parent: 'me' },
];

const countText = (n) => (n > 99 ? '99+' : String(n));

/** Bölüm ikonu: renk tonlu yuvarlak köşeli kutu (kenar çubuğu, çekmece, üst çubuk yolu). */
function Tile({ icon: Icon, tint, size = 'md' }) {
  return <span className={classNames(styles.tile, styles[`tint_${tint}`], styles[`tile_${size}`])} aria-hidden><Icon size={size === 'sm' ? 15 : 18} /></span>;
}

/**
 * Kenar çubuğu ve çekmecenin ortak içeriği: marka, bölümler + alt sayfalar (sayaçlı), plan kartı, yardım/ayarlar.
 * onNavigate: çekmecede bir bağlantıya basınca kapat.
 */
function SideNav({ t, o, on, childOn, plan, guest, usage, navigate, onNavigate, onClose }) {
  return (
    <>
      <div className={styles.brandRow}>
        <Link to={Routes.today} className={styles.brand} onClick={onNavigate}>
          <BrandMark size={30} />
          <span className={styles.brandText}>{t('app.name')}</span>
        </Link>
        {onClose && <IconButton label={t('nav.closeMenu')} onClick={onClose}><X size={20} /></IconButton>}
      </div>
      <nav className={styles.nav} aria-label={t('nav.main')}>
        {NAV.map(({ key, to, icon, tint }) => {
          const parent = childOn(key);
          return (
            <div key={key} className={styles.group}>
              <NavLink to={to} onClick={onNavigate} className={({ isActive }) => classNames(styles.item, parent ? styles.parent : isActive && styles.active)}>
                <Tile icon={icon} tint={tint} />
                <span className={styles.itemLabel}>{t(`nav.${key}`)}</span>
              </NavLink>
              {SUB[key] && (
                <div className={styles.sub}>
                  {SUB[key].map((s) => {
                    const n = s.count?.(o) || 0;
                    const SubIcon = s.icon;
                    return (
                      <NavLink key={s.to} to={s.to} onClick={onNavigate} className={({ isActive }) => classNames(styles.subItem, (isActive || on(s.to)) && styles.active)}>
                        <SubIcon size={16} aria-hidden className={styles.subIcon} />
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
          );
        })}
      </nav>
      <div className={styles.sideFoot}>
        {guest && <button type="button" className={styles.guestCta} onClick={() => { onNavigate?.(); navigate(Routes.signUp); }}>{t('nav.saveProgress')}</button>}
        {plan === 'free' && usage && (
          <div className={styles.plan}>
            <div className={styles.planHead}>
              <span className={styles.planLabel}>{t('nav.plan.free')}</span>
              <span className={styles.planNum}>{usage.remaining}/{usage.limit}</span>
            </div>
            <span className={styles.planSub}>{t('nav.plan.left')}</span>
            <div className={styles.planBar} aria-hidden><span style={{ width: `${Math.round((usage.remaining / usage.limit) * 100)}%` }} /></div>
            <Link to={Routes.premium} className={styles.planCta} onClick={onNavigate}><Sparkles size={16} aria-hidden />{t('nav.plan.cta')}</Link>
          </div>
        )}
        {plan === 'premium' && (
          <Link to={Routes.premium} className={styles.premium} onClick={onNavigate}>
            <span className={styles.premiumIcon} aria-hidden><Crown size={16} /></span>
            <span className={styles.premiumText}>
              <span className={styles.premiumTitle}>{t('nav.plan.premium')}</span>
              <span className={styles.premiumSub}>{t('nav.plan.premiumSub')}</span>
            </span>
          </Link>
        )}
        <div className={styles.footLinks}>
          {FOOT.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => classNames(styles.footItem, isActive && styles.active)}>
              <Icon size={18} aria-hidden /> <span>{t(label)}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </>
  );
}

// Telefon (<600): alt sekmeler · dikey tablet (600–899): üst çubuk + menü çekmecesi + alt sekmeler ·
// yatay tablet (900–1199): etiketli ray + çekmece · masaüstü (≥1200): kenar çubuğu. Çekmece kenar çubuğunun tamamını taşır (alt sayfalar dahil).
export default function AppShell() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const name = user?.displayName || user?.email || t('nav.guest');
  const guest = isGuestUser(user);
  const authed = status === 'authenticated';

  const overview = useApiQuery(['learning', 'study', 'overview'], () => api.learningStudyOverviewGet(), {
    enabled: authed,
    staleTime: 60_000,
    meta: { suppressGlobalErrorNotification: true },
  });
  const ent = useApiQuery(['pay', 'entitlements'], () => api.billingEntitlementsGet(), {
    enabled: authed && !guest,
    staleTime: 5 * 60_000,
    meta: { suppressGlobalErrorNotification: true },
  });
  const o = overview.data;
  const usage = o?.usage;
  const plan = guest ? null : ent.data?.tier === 'premium' ? 'premium' : (typeof usage?.limit === 'number' && usage.limit > 0 ? 'free' : null);

  const on = (to) => Boolean(matchPath({ path: to, end: false }, pathname));
  const childOn = (key) => (SUB[key] || []).some((s) => on(s.to)) || FOOT.some((f) => f.parent === key && on(f.to));

  // Üst çubuktaki yol: bölüm › alt sayfa (alt sayfa önce aranır: /study/library hem Çalış'a hem Kitaplık'a uyar).
  const crumbOf = () => {
    for (const n of NAV) {
      const sub = (SUB[n.key] || []).find((s) => on(s.to));
      if (sub) return { section: n, sub };
    }
    const foot = FOOT.find((f) => on(f.to));
    if (foot) return { section: NAV.find((n) => n.key === foot.parent) || null, sub: foot };
    return { section: NAV.find((n) => on(n.to)) || null, sub: null };
  };
  const crumb = crumbOf();

  // Çekmece: rotada değişince kapanır; Esc ile kapanır; açıkken arka plan kaymaz; kapanınca odak menü düğmesine döner.
  const [drawer, setDrawer] = useState(false);
  const opener = useRef(null);
  const panel = useRef(null);
  const close = useCallback(() => setDrawer(false), []);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (drawer) setDrawer(false);
  }
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('a, button')?.focus();
    const back = opener.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      back?.focus?.();
    };
  }, [drawer]);

  const navProps = { t, o, on, childOn, plan, guest, usage, navigate };
  const openDrawer = (e) => {
    opener.current = e.currentTarget;
    setDrawer(true);
  };
  const CrumbIcon = crumb.sub?.icon;

  return (
    <div className={styles.shell}>
      <AppBackground />

      {/* Masaüstü kenar çubuğu */}
      <aside className={styles.side}>
        <SideNav {...navProps} />
      </aside>

      {/* Yatay tablet rayı: menü + beş bölüm, etiketli */}
      <nav className={styles.rail} aria-label={t('nav.main')}>
        <button type="button" className={styles.railMenu} onClick={openDrawer} aria-expanded={drawer} aria-label={t('nav.openMenu')} title={t('nav.openMenu')}>
          <Menu size={22} aria-hidden />
        </button>
        {NAV.map(({ key, to, icon: Icon }) => (
          <NavLink key={key} to={to} className={({ isActive }) => classNames(styles.railItem, (isActive || childOn(key)) && styles.active)}>
            <span className={styles.railIcon} aria-hidden><Icon size={22} /></span>
            <span className={styles.railLabel}>{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
      </nav>

      {/* Çekmece (tabletler): kenar çubuğunun tamamı */}
      <div className={classNames(styles.scrim, drawer && styles.scrimOn)} onClick={close} aria-hidden />
      <aside ref={panel} className={classNames(styles.drawer, drawer && styles.drawerOn)} role="dialog" aria-modal="true" aria-label={t('nav.main')} aria-hidden={!drawer} inert={!drawer}>
        <SideNav {...navProps} onNavigate={close} onClose={close} />
      </aside>

      <div className={styles.main}>
        <header className={styles.top}>
          <IconButton className={styles.topMenu} label={t('nav.openMenu')} onClick={openDrawer} aria-expanded={drawer}><Menu size={20} /></IconButton>
          {crumb.section && (
            <nav className={styles.crumbs} aria-label={t('nav.breadcrumb')}>
              <Link to={crumb.section.to} className={classNames(styles.crumb, !crumb.sub && styles.crumbCurrent)} aria-current={crumb.sub ? undefined : 'page'}>
                <Tile icon={crumb.section.icon} tint={crumb.section.tint} size="sm" />
                <span>{t(`nav.${crumb.section.key}`)}</span>
              </Link>
              {crumb.sub && (
                <>
                  <ChevronRight size={16} className={styles.crumbSep} aria-hidden />
                  <span className={classNames(styles.crumb, styles.crumbCurrent)} aria-current="page">
                    {CrumbIcon && <CrumbIcon size={16} aria-hidden className={styles.crumbSubIcon} />}
                    <span>{t(crumb.sub.label)}</span>
                  </span>
                </>
              )}
            </nav>
          )}
          <div className="grow" />
          <div className={styles.actions}>
            <ThemeToggle />
            <FeedbackButton />
            <IconButton label={t('nav.notifications')}><Bell size={20} /></IconButton>
          </div>
          <button type="button" className={styles.profile} onClick={() => navigate(Routes.me)} aria-label={t('nav.me')}>
            <Avatar name={name} size={34} />
            <span className={styles.profileText}>
              <span className={styles.profileName}>{name}</span>
              {plan && <span className={classNames(styles.profilePlan, plan === 'premium' && styles.profilePremium)}>{plan === 'premium' ? t('nav.plan.premium') : t('nav.plan.free')}</span>}
            </span>
          </button>
        </header>
        <main className={styles.content} id="main"><Outlet /></main>
      </div>

      {/* Telefon ve dikey tablet: alt sekme çubuğu */}
      <nav className={styles.tabs} aria-label={t('nav.main')}>
        {NAV.map(({ key, to, icon: Icon }) => (
          <NavLink key={key} to={to} className={({ isActive }) => classNames(styles.tab, (isActive || childOn(key)) && styles.active)}>
            <span className={styles.tabIcon} aria-hidden><Icon size={22} /></span>
            <span>{t(`nav.${key}`)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
