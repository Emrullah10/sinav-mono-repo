import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import EmptyState from '@components/EmptyState/EmptyState';
import Routes from '@shared/constant/route-paths';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <EmptyState title={t('errors.notFound.title')} body={t('errors.notFound.body')} action={<Link to={Routes.today}>{t('common.goHome')}</Link>} />
    </div>
  );
}
