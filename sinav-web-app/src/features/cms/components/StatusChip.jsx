import { useTranslation } from 'react-i18next';
import Chip from '@components/Chip/Chip';

const TONE = {
  published: 'success', approved: 'success', completed: 'success', resolved: 'success',
  in_review: 'warning', submitted: 'warning', pilot: 'warning', queued: 'warning', running: 'warning', open: 'warning',
  changes_requested: 'danger', rejected: 'danger', failed: 'danger', retired: 'default', canceled: 'default', draft: 'default', superseded: 'default',
};

// Durum etiketi: ad her zaman metinle de gösterilir (renk tek başına anlam taşımaz).
export default function StatusChip({ status }) {
  const { t } = useTranslation();
  if (!status) return null;
  return <Chip size="sm" tone={TONE[status] || 'default'}>{t(`cmsx.status.${status}`, { defaultValue: status })}</Chip>;
}
