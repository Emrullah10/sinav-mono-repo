import { useTranslation } from 'react-i18next';
import EmptyState from '@components/EmptyState/EmptyState';
import { Wrench } from 'lucide-react';

export default function Maintenance() {
  const { t } = useTranslation();
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><EmptyState icon={<Wrench size={32} />} title={t('system.maintenance.title')} body={t('system.maintenance.body')} /></div>;
}
