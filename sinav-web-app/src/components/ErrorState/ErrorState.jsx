import { useTranslation } from 'react-i18next';
import { CloudOff } from 'lucide-react';
import { getApiErrorMessage } from '@shared/utils/apiError';
import Button from '@components/Button/Button';
import EmptyState from '@components/EmptyState/EmptyState';

export default function ErrorState({ error, onRetry }) {
  const { t } = useTranslation();
  return <EmptyState icon={<CloudOff size={32} />} title={t('errors.generic.title')} body={getApiErrorMessage(error)} action={onRetry && <Button variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>} />;
}
