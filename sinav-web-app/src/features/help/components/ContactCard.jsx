import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import Button from '@components/Button/Button';
import Card from '@components/Card/Card';
import { ensureSession } from '@shared/auth/session';
import { notify } from '@shared/utils/notify';
import { getApiErrorMessage } from '@shared/utils/apiError';
import { useFeedbackStore } from '@features/feedback/feedbackStore';
import styles from '../Help.module.scss';

// "Bize yaz": web'de iletişim formu yok; geri bildirim penceresi (oturum ister, gerekirse misafir açılır).
export default function ContactCard() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      await ensureSession();
      const fb = useFeedbackStore.getState();
      fb.setKind('other');
      fb.show();
    } catch (e) {
      notify(getApiErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className={styles.contact}>
      <span className={styles.ico}><MessageCircle size={22} aria-hidden /></span>
      <div className="grow">
        <h2 className="t-heading-3">{t('help.contactTitle')}</h2>
        <p className="muted t-body-m">{t('help.contactBody')}</p>
      </div>
      <Button variant="secondary" onClick={open} loading={busy}>{t('help.contactCta')}</Button>
    </Card>
  );
}
