import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import Button from '@components/Button/Button';
import TextInput from '@components/TextInput/TextInput';
import useApiMutation from '@hooks/useApiMutation';
import Routes from '@shared/constant/route-paths';
import { applySession } from '@shared/auth/session';
import { getApiErrorMessage } from '@shared/utils/apiError';
import AuthCard from '../components/AuthCard';
import CodeEntry from '../components/CodeEntry';
import { EMAIL_RE } from '../authFlow';

// AUTH-03: e-posta kodu birincil, şifre ikincil.
export default function SignIn() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const from = loc.state?.from;
  const [mode, setMode] = useState('code'); // code | password
  const [step, setStep] = useState('email'); // email | code
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [retry, setRetry] = useState(60);
  const [err, setErr] = useState('');

  const done = (data) => {
    applySession({ data: { data } });
    nav(from || Routes.today, { replace: true });
  };
  const onErr = (e) => setErr(getApiErrorMessage(e));
  const sendCode = useApiMutation(() => api.identityAuthSendCode({ email: email.trim(), purpose: 'login' }), {
    onSuccess: (d) => { setErr(''); setRetry(d?.retryAfterSeconds ?? 60); setStep('code'); },
    onError: onErr,
  });
  const verify = useApiMutation((code) => api.identityAuthVerifyCode({ email: email.trim(), code }), { onSuccess: done, onError: onErr });
  const pwLogin = useApiMutation(() => api.identityAuthPasswordLogin({ email: email.trim(), password }), { onSuccess: done, onError: onErr });
  const validEmail = EMAIL_RE.test(email.trim());

  const footer = <>{t('auth.signIn.noAccount')} <Link to={Routes.welcome}>{t('auth.signIn.start')}</Link></>;

  if (mode === 'code' && step === 'code') {
    return (
      <AuthCard title={t('auth.code.title')} footer={footer}>
        <CodeEntry email={email.trim()} initialRetry={retry} loading={verify.isPending} error={err} onSubmit={(c) => { setErr(''); verify.mutate(c); }} onResend={() => sendCode.mutateAsync()} onChangeEmail={() => { setErr(''); setStep('email'); }} />
      </AuthCard>
    );
  }
  const submit = (e) => {
    e.preventDefault();
    setErr('');
    if (mode === 'code') sendCode.mutate();
    else pwLogin.mutate();
  };
  return (
    <AuthCard title={t('auth.signIn.title')} subtitle={mode === 'code' ? t('auth.signIn.subtitle') : undefined} footer={footer}>
      <form onSubmit={submit} className="stack">
        <TextInput label={t('auth.email.label')} type="email" autoComplete="email" inputMode="email" placeholder={t('auth.email.placeholder')} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus error={mode === 'code' ? err : undefined} />
        {mode === 'password' && (
          <TextInput label={t('auth.signIn.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={err} />
        )}
        <Button type="submit" size="lg" block loading={sendCode.isPending || pwLogin.isPending} disabled={!validEmail || (mode === 'password' && !password)}>
          {mode === 'code' ? t('auth.signIn.sendCode') : t('auth.signIn.submit')}
        </Button>
        <Button type="button" variant="secondary" block onClick={() => { setErr(''); setMode(mode === 'code' ? 'password' : 'code'); }}>
          {mode === 'code' ? t('auth.signIn.withPassword') : t('auth.signIn.withCode')}
        </Button>
        {mode === 'password' && <Link to={Routes.passwordReset} className="t-body-s" style={{ textAlign: 'center' }}>{t('auth.signIn.forgot')}</Link>}
      </form>
    </AuthCard>
  );
}
