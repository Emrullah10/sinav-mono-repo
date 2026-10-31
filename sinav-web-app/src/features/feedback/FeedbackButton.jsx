import { useTranslation } from 'react-i18next';
import { MessageSquareWarning } from 'lucide-react';
import IconButton from '@components/IconButton/IconButton';
import { useFeedbackStore } from './feedbackStore';

/** Geri bildirim penceresini açan simge düğmesi (üst çubuk, odak modu). */
export default function FeedbackButton({ className, size = 20 }) {
  const { t } = useTranslation();
  const show = useFeedbackStore((s) => s.show);
  return (
    <IconButton label={t('feedback.open')} className={className} onClick={show}>
      <MessageSquareWarning size={size} />
    </IconButton>
  );
}
