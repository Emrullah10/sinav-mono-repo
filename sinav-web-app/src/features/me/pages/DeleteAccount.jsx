import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { signOut } from '@shared/auth/session';
import Routes from '@shared/constant/route-paths';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Banner from '@components/Banner/Banner';
import Button from '@components/Button/Button';
import TextInput from '@components/TextInput/TextInput';
import styles from '../components/page.module.scss';

// ME-10: hesap silme. POST /account/deletion/code → POST /account/deletion { code } (30 gün içinde girişle iptal olur).
export default function DeleteAccount() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const sub = useApiQuery(['pay', 'subscription'], () => api.billingSubscriptionGet());
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [done, setDone] = useState(null);
  const send = useApiMutation(() => api.identityAccountDeletionCode(), { successMessage: 'me.del.sent', onSuccess: () => setSent(true) });
  const confirm = useApiMutation(() => api.identityAccountDeletionRequest({ code: code.trim() }), { onSuccess: (d) => setDone(d.scheduledFor) });
  const s = sub.data;

  if (done) {
    return (
      <div className={styles.page}>
        <Card tone="accent" className="stack">
          <h1 className="t-heading-1">{t('me.del.doneTitle')}</h1>
          <p className="t-body-m">{t('me.del.doneBody', { date: dayjs(done).format('D MMMM YYYY') })}</p>
          <div><Button onClick={() => signOut().then(() => nav(Routes.welcome, { replace: true }))}>{t('me.del.ok')}</Button></div>
        </Card>
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <PageHeader title={t('me.del.title')} subtitle={t('me.del.subtitle')} />
      <Banner tone="warning">{t('me.del.warn')}</Banner>
      {s?.store?.managed && <Banner tone="error">{t(s.store.noteKey || 'me.sub.store')}</Banner>}
      {s?.hasSubscription && !s.store?.managed && <Banner tone="info">{t('me.del.subscription', { date: s.validUntil ? dayjs(s.validUntil).format('D MMMM YYYY') : '' })}</Banner>}
      <Card className="stack">
        <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
          <li>{t('me.del.item1')}</li><li>{t('me.del.item2')}</li><li>{t('me.del.item3')}</li>
        </ul>
        {!sent ? (
          <div className="row"><Button variant="destructive" loading={send.isPending} onClick={() => send.mutate()}>{t('me.del.sendCode')}</Button><Button variant="tertiary" onClick={() => nav(Routes.meSettings)}>{t('me.del.keep')}</Button></div>
        ) : (
          <div className="stack-sm">
            <TextInput label={t('me.del.code')} inputMode="numeric" autoComplete="one-time-code" helper={t('me.del.codeHelp')} value={code} onChange={(e) => setCode(e.target.value)} />
            <div className="row"><Button variant="destructive" disabled={code.trim().length < 4} loading={confirm.isPending} onClick={() => confirm.mutate()}>{t('me.del.confirm')}</Button><Button variant="tertiary" onClick={() => nav(Routes.meSettings)}>{t('me.del.keep')}</Button></div>
          </div>
        )}
      </Card>
    </div>
  );
}
