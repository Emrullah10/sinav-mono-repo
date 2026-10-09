import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import Button from '@components/Button/Button';
import TextInput from '@components/TextInput/TextInput';
import ProgressBar from '@components/ProgressBar/ProgressBar';
import useApiMutation from '@hooks/useApiMutation';
import Routes from '@shared/constant/route-paths';
import { notify } from '@shared/utils/notify';
import { getApiErrorMessage } from '@shared/utils/apiError';
import AuthCard from '../components/AuthCard';
import useCountdown from '../hooks/useCountdown';
import { EMAIL_RE } from '../authFlow';

const strength = (p) => {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[a-zçğıöşü]/.test(p) && /[A-ZÇĞİÖŞÜ]/.test(p)) s++;
  if (/\d/.test(p) && /[^\w\s]/.test(p)) s++;
  return p.length < 8 ? 0 : s <= 1 ? 1 : s === 2 ? 2 : 3;
};

// AUTH-04: e-posta → kod → yeni şifre (güç göstergesi metinle).
export default function PasswordReset() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [left, start] = useCountdown(0);
  const request = useApiMutation(() => api.identityAuthPasswordResetRequest({ email: email.trim() }), {
    onSuccess: (d) => { setErr(''); start(d?.retryAfterSeconds ?? 60); setStep('confirm'); },
    onError: (e) => setErr(getApiErrorMessage(e)),
  });
  const confirm = useApiMutation(() => api.identityAuthPasswordResetConfirm({ email: email.trim(), code, newPassword: pw }), {
    onSuccess: () => { notify(t('auth.reset.done'), 'success'); nav(Routes.signIn, { replace: true }); },
    onError: (e) => setErr(getApiErrorMessage(e)),
  });
  const st = strength(pw);
  const stKey = ['weak', 'weak', 'ok', 'strong'][st];
  const footer = <Link to={Routes.signIn}>{t('auth.back')}</Link>;

  if (step === 'email') {
    return (
      <AuthCard title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')} footer={footer}>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); setErr(''); request.mutate(); }}>
          <TextInput label={t('auth.email.label')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.email.placeholder')} error={err} autoFocus />
          <Button type="submit" size="lg" block loading={request.isPending} disabled={!EMAIL_RE.test(email.trim())}>{t('auth.signIn.sendCode')}</Button>
        </form>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('auth.reset.title')} subtitle={`${t('auth.code.sentTo')} ${email.trim()}`} footer={footer}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); setErr(''); confirm.mutate(); }}>
        <TextInput label={t('auth.code.label')} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus />
        <div className="stack-sm">
          <TextInput label={t('auth.reset.newPassword')} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} helper={t('auth.reset.helper')} error={err} />
          {pw && (
            <>
              <ProgressBar value={(st / 3) * 100} size="sm" tone={st === 3 ? 'success' : 'accent'} label={t(`auth.reset.strength.${stKey}`)} />
              <p className="t-caption muted" aria-live="polite">{t(`auth.reset.strength.${stKey}`)}</p>
            </>
          )}
        </div>
        <Button type="submit" size="lg" block loading={confirm.isPending} disabled={code.length !== 6 || pw.length < 8}>{t('auth.reset.submit')}</Button>
        <Button type="button" variant="tertiary" disabled={left > 0} onClick={() => request.mutate()}>{left > 0 ? t('auth.code.resendIn', { s: left }) : t('auth.code.resend')}</Button>
      </form>
    </AuthCard>
  );
}
