import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, Trash2, FileText } from 'lucide-react';
import dayjs from 'dayjs';
import api from '@api';
import useApiQuery from '@hooks/useApiQuery';
import useApiMutation from '@hooks/useApiMutation';
import { queryClient } from '@shared/providers/QueryProvider';
import { notify } from '@shared/utils/notify';
import { getApiErrorMessage } from '@shared/utils/apiError';
import { money } from '@features/pay/utils';
import CardFields, { emptyCard, cardBody, cardValid } from '@features/pay/components/CardFields';
import BillingProfileForm, { emptyProfile, profileBody, profileToForm, profileValid } from '@features/pay/components/BillingProfileForm';
import PageHeader from '@components/PageHeader/PageHeader';
import Card from '@components/Card/Card';
import Chip from '@components/Chip/Chip';
import Button from '@components/Button/Button';
import Modal from '@components/Modal/Modal';
import EmptyState from '@components/EmptyState/EmptyState';
import ErrorState from '@components/ErrorState/ErrorState';
import { SkeletonList } from '@components/Skeleton/Skeleton';
import styles from '../components/page.module.scss';

const refresh = () => { queryClient.invalidateQueries({ queryKey: ['pay'] }); };

// ME-08: ödeme yöntemleri, faturalar ve fatura bilgileri.
export default function Payment() {
  const { t } = useTranslation();
  const methods = useApiQuery(['pay', 'methods'], () => api.billingPaymentMethodsList());
  const invoices = useApiQuery(['pay', 'invoices'], () => api.billingInvoicesList());
  const profileQ = useApiQuery(['pay', 'profile'], () => api.billingProfileGet());
  const [adding, setAdding] = useState(false);
  const [card, setCard] = useState(emptyCard);
  const [removing, setRemoving] = useState(null);
  const [profile, setProfile] = useState(emptyProfile);
  useEffect(() => { if (profileQ.data) setProfile(profileToForm(profileQ.data.profile, profileQ.data.prefill)); }, [profileQ.data]);

  const add = useApiMutation(() => api.billingPaymentMethodAdd({ card: cardBody(card) }), { successMessage: 'me.pay.added', onSuccess: () => { setAdding(false); setCard(emptyCard); refresh(); } });
  const remove = useApiMutation((c) => api.billingPaymentMethodRemove(c), { onSuccess: (d) => { setRemoving(null); notify(t(d.affectedSubscriptions > 0 ? 'me.pay.removedSub' : 'me.pay.removed'), 'success'); refresh(); } });
  const makeDefault = useApiMutation((c) => api.billingPaymentMethodDefault(c), { successMessage: 'me.pay.defaulted', onSuccess: refresh });
  const saveProfile = useApiMutation(() => api.billingProfileSave(profileBody(profile)), { successMessage: 'me.pay.profileSaved', onSuccess: refresh });

  const openReceipt = async (code) => {
    try {
      const res = await api.billingInvoiceDocumentGet(code);
      const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { notify(getApiErrorMessage(e), 'error'); }
  };

  const items = methods.data?.items || [];
  return (
    <div className={styles.page}>
      <PageHeader title={t('me.pay.title')} />

      <section className="stack-sm" aria-label={t('me.pay.cards')}>
        <div className="row"><h2 className="t-heading-2 grow">{t('me.pay.cards')}</h2><Button variant="secondary" size="sm" onClick={() => setAdding(true)}>{t('me.pay.addCard')}</Button></div>
        {methods.isLoading && <SkeletonList rows={1} />}
        {methods.isError && <ErrorState error={methods.error} onRetry={methods.refetch} />}
        {methods.data && items.length === 0 && <EmptyState icon={<CreditCard size={32} />} title={t('me.pay.noCards')} body={t('me.pay.noCardsBody')} />}
        <ul className={styles.list}>
          {items.map((m) => (
            <li key={m.code} className={styles.item}>
              <span className="row">
                <CreditCard size={20} aria-hidden />
                <span className="grow t-title tnum">{m.brand} •••• {m.last4} <span className="muted t-body-s">{String(m.expMonth).padStart(2, '0')}/{String(m.expYear).slice(-2)}</span></span>
                {m.isDefault && <Chip size="sm" selected>{t('me.pay.default')}</Chip>}
              </span>
              <span className="row">
                {!m.isDefault && <Button size="sm" variant="secondary" loading={makeDefault.isPending && makeDefault.variables === m.code} onClick={() => makeDefault.mutate(m.code)}>{t('me.pay.makeDefault')}</Button>}
                <Button size="sm" variant="tertiary" startIcon={<Trash2 size={16} />} onClick={() => setRemoving(m)}>{t('me.pay.remove')}</Button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stack-sm" aria-label={t('me.pay.invoices')}>
        <h2 className="t-heading-2">{t('me.pay.invoices')}</h2>
        {invoices.isLoading && <SkeletonList rows={2} />}
        {invoices.isError && <ErrorState error={invoices.error} onRetry={invoices.refetch} />}
        {invoices.data && invoices.data.items.length === 0 && <p className="muted">{t('me.pay.noInvoices')}</p>}
        <ul className={styles.list}>
          {invoices.data?.items.map((i) => (
            <li key={i.code} className={styles.item}>
              <span className="row">
                <span className="grow"><strong className="t-title">{i.planName}</strong><span className="t-caption muted" style={{ display: 'block' }}>{dayjs(i.createdAt).format('D MMMM YYYY')} · {t(`enums.invoice_status.${i.status}`)}</span></span>
                <span className="t-title tnum">{money(i.total, i.currency)}</span>
              </span>
              {i.documentAvailable && <span><Button size="sm" variant="secondary" startIcon={<FileText size={16} />} onClick={() => openReceipt(i.code)}>{t('me.pay.receipt')}</Button></span>}
            </li>
          ))}
        </ul>
        <p className="t-caption muted">{t('me.pay.invoiceNote')}</p>
      </section>

      <section className="stack-sm" aria-label={t('me.pay.profile')}>
        <h2 className="t-heading-2">{t('me.pay.profile')}</h2>
        <Card className="stack">
          <BillingProfileForm value={profile} onChange={setProfile} maskedNationalId={profileQ.data?.profile?.nationalIdMasked} />
          <div><Button disabled={!profileValid(profile)} loading={saveProfile.isPending} onClick={() => saveProfile.mutate()}>{t('common.save')}</Button></div>
        </Card>
      </section>

      <Modal open={adding} onClose={() => setAdding(false)} title={t('me.pay.addCard')}
        footer={<><Button variant="tertiary" onClick={() => setAdding(false)}>{t('common.cancel')}</Button><Button disabled={!cardValid(card)} loading={add.isPending} onClick={() => add.mutate()}>{t('common.save')}</Button></>}>
        <CardFields value={card} onChange={setCard} />
      </Modal>
      <Modal open={!!removing} onClose={() => setRemoving(null)} title={t('me.pay.removeTitle')}
        footer={<><Button variant="tertiary" onClick={() => setRemoving(null)}>{t('common.cancel')}</Button><Button variant="destructive" loading={remove.isPending} onClick={() => remove.mutate(removing.code)}>{t('me.pay.remove')}</Button></>}>
        <p>{removing && t('me.pay.removeBody', { brand: removing.brand, last4: removing.last4 })}</p>
      </Modal>
    </div>
  );
}
