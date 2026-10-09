import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import Routes from '@shared/constant/route-paths';
import { useHasPermission } from '@shared/auth/permissions';
import PageHeader from '@components/PageHeader/PageHeader';
import { SYS } from '../paths';
import s from './Sys.module.scss';

// Sistem yönetimi (yalnız personel). Gezinme öğeleri izne göre görünür.
export default function SysShell({ title, subtitle, actions, children }) {
  const { t } = useTranslation();
  const metric = useHasPermission('platform:metric:read');
  const revoke = useHasPermission('platform:session:revoke');
  const billing = useHasPermission('billing:manage');
  const sw = useHasPermission('session:switch');
  const nav = [
    metric && ['status', SYS.status], billing && ['plans', SYS.plans], revoke && ['sessions', SYS.sessions], sw && ['account', SYS.account],
  ].filter(Boolean);
  return (
    <div className={s.shell}>
      <aside className={s.side}>
        <div className={s.brand}>{t('app.name')} · {t('sysx.title')}</div>
        <nav aria-label={t('sysx.title')}>
          {nav.map(([k, to]) => <NavLink key={k} to={to} end className={({ isActive }) => classNames(s.item, isActive && s.active)}>{t(`sysx.nav.${k}`)}</NavLink>)}
        </nav>
        <NavLink to={Routes.cms} className={s.item}>{t('sysx.nav.cms')}</NavLink>
        <NavLink to={Routes.today} className={s.item}>{t('cms.nav.backToApp')}</NavLink>
      </aside>
      <main className={s.main} id="main">
        <PageHeader title={title} subtitle={subtitle} actions={actions} />
        {children}
      </main>
    </div>
  );
}
