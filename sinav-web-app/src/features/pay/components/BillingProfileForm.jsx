import { useTranslation } from 'react-i18next';
import TextInput from '@components/TextInput/TextInput';
import Segmented from '@components/Segmented/Segmented';
import styles from './Fields.module.scss';

export const emptyProfile = { partyType: 'individual', fullName: '', addressLine: '', city: '', district: '', postalCode: '', email: '', nationalId: '', companyTitle: '', taxOffice: '', taxNumber: '' };

// Sunucu profilinden form durumuna (nationalId asla geri gelmez; maskeli değer yalnız ipucudur).
export const profileToForm = (p, prefill) => ({ ...emptyProfile, fullName: prefill?.fullName || '', email: prefill?.email || '', ...(p ? Object.fromEntries(Object.entries(p).filter(([k, v]) => k in emptyProfile && v != null)) : {}), nationalId: '' });

export const profileBody = (f) => {
  const corp = f.partyType === 'corporate';
  const body = { partyType: f.partyType, fullName: f.fullName.trim(), addressLine: f.addressLine.trim(), city: f.city.trim(), country: 'TR' };
  ['district', 'postalCode', 'email'].forEach((k) => { if (f[k]?.trim()) body[k] = f[k].trim(); });
  if (!corp && f.nationalId.trim()) body.nationalId = f.nationalId.trim();
  if (corp) { body.companyTitle = f.companyTitle.trim(); body.taxOffice = f.taxOffice.trim(); body.taxNumber = f.taxNumber.trim(); }
  return body;
};
export const profileValid = (f) => f.fullName.trim() && f.addressLine.trim() && f.city.trim() && (f.partyType !== 'corporate' || (f.companyTitle.trim() && f.taxOffice.trim() && /^\d{10,11}$/.test(f.taxNumber.trim())));

export default function BillingProfileForm({ value, onChange, maskedNationalId, disabled }) {
  const { t } = useTranslation();
  const set = (k, v) => onChange({ ...value, [k]: v });
  const corp = value.partyType === 'corporate';
  return (
    <div className="stack-sm">
      <Segmented label={t('pay.profile.type')} value={value.partyType} onChange={(v) => set('partyType', v)} options={[{ value: 'individual', label: t('pay.profile.individual') }, { value: 'corporate', label: t('pay.profile.corporate') }]} />
      <TextInput label={t('pay.profile.fullName')} autoComplete="name" value={value.fullName} disabled={disabled} onChange={(e) => set('fullName', e.target.value)} />
      {corp ? (
        <>
          <TextInput label={t('pay.profile.companyTitle')} value={value.companyTitle} disabled={disabled} onChange={(e) => set('companyTitle', e.target.value)} />
          <div className={styles.two}>
            <TextInput label={t('pay.profile.taxOffice')} value={value.taxOffice} disabled={disabled} onChange={(e) => set('taxOffice', e.target.value)} />
            <TextInput label={t('pay.profile.taxNumber')} inputMode="numeric" maxLength={11} value={value.taxNumber} disabled={disabled} onChange={(e) => set('taxNumber', e.target.value.replace(/\D/g, ''))} />
          </div>
        </>
      ) : (
        <TextInput label={t('pay.profile.nationalId')} inputMode="numeric" maxLength={11} placeholder={maskedNationalId || ''} helper={t('pay.profile.nationalIdHelp')} value={value.nationalId} disabled={disabled} onChange={(e) => set('nationalId', e.target.value.replace(/\D/g, ''))} />
      )}
      <TextInput label={t('pay.profile.address')} autoComplete="street-address" value={value.addressLine} disabled={disabled} onChange={(e) => set('addressLine', e.target.value)} />
      <div className={styles.two}>
        <TextInput label={t('pay.profile.district')} value={value.district} disabled={disabled} onChange={(e) => set('district', e.target.value)} />
        <TextInput label={t('pay.profile.city')} autoComplete="address-level1" value={value.city} disabled={disabled} onChange={(e) => set('city', e.target.value)} />
      </div>
      <TextInput label={t('pay.profile.email')} type="email" autoComplete="email" value={value.email} disabled={disabled} onChange={(e) => set('email', e.target.value)} />
    </div>
  );
}
