import { useTranslation } from 'react-i18next';
import TextInput from '@components/TextInput/TextInput';
import styles from './Fields.module.scss';

export const emptyCard = { number: '', holder: '', exp: '', cvc: '' };

// "08 / 29" ya da "0829" → { expMonth, expYear }
export const parseExp = (exp) => {
  const d = String(exp).replace(/\D/g, '');
  const mm = Number(d.slice(0, 2));
  const yy = Number(d.slice(2, 4));
  return { expMonth: mm, expYear: d.length >= 4 ? 2000 + yy : 0 };
};
export const cardBody = (c) => ({ number: c.number.replace(/\s/g, ''), holder: c.holder.trim(), ...parseExp(c.exp), cvc: c.cvc });
export const cardValid = (c) => {
  const b = cardBody(c);
  return b.number.length >= 15 && b.holder.length > 1 && b.expMonth >= 1 && b.expMonth <= 12 && b.expYear >= 2000 && b.cvc.length >= 3;
};

const groupNumber = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();
const fmtExp = (v) => { const d = v.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d; };

// Yalnız sahte sağlayıcıda kart alanları uygulamadadır; gerçek sağlayıcıda sağlayıcının kendi alanı kullanılır.
export default function CardFields({ value, onChange, disabled }) {
  const { t } = useTranslation();
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="stack-sm">
      <TextInput label={t('pay.card.holder')} autoComplete="cc-name" value={value.holder} disabled={disabled} onChange={(e) => set('holder', e.target.value)} />
      <TextInput label={t('pay.card.number')} inputMode="numeric" autoComplete="cc-number" value={value.number} disabled={disabled} onChange={(e) => set('number', groupNumber(e.target.value))} />
      <div className={styles.two}>
        <TextInput label={t('pay.card.exp')} inputMode="numeric" autoComplete="cc-exp" placeholder="AA / YY" value={value.exp} disabled={disabled} onChange={(e) => set('exp', fmtExp(e.target.value))} />
        <TextInput label={t('pay.card.cvc')} inputMode="numeric" autoComplete="cc-csc" type="password" maxLength={4} value={value.cvc} disabled={disabled} onChange={(e) => set('cvc', e.target.value.replace(/\D/g, ''))} />
      </div>
    </div>
  );
}
