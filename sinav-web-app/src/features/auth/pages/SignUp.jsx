import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@api';
import Button from '@components/Button/Button';
import TextInput from '@components/TextInput/TextInput';
import Markdown from '@components/Markdown/Markdown';
import Card from '@components/Card/Card';
import BubbleLoader from '@components/BubbleLoader/BubbleLoader';
import useApiMutation from '@hooks/useApiMutation';
import useApiQuery from '@hooks/useApiQuery';
import Routes, { path } from '@shared/constant/route-paths';
import { applySession, ensureSession } from '@shared/auth/session';
import { useAuthStore, isGuestUser } from '@store/authStore';
import { apiErrorCode } from '@sinav/client-sdk';
import { getApiErrorMessage } from '@shared/utils/apiError';
import AuthCard from '../components/AuthCard';
import CodeEntry from '../components/CodeEntry';
import { EMAIL_RE } from '../authFlow';
import styles from './SignUp.module.scss';

// AUTH-02 + AUTH-05 + AUTH-06 (satır içi adımlar): e-posta → kod → onaylar/ad → POST /auth/register (misafir → öğrenci).
export default function SignUp() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const from = loc.state?.from;
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState('email'); // email | code | consent
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kvkk, setKvkk] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [retry, setRetry] = useState(60);
  const [err, setErr] = useState('');
  const [exists, setExists] = useState(false);
  const [sessionErr, setSessionErr] = useState(null);

  // Kayıt misafir oturumu ister: yoksa aç.
  useEffect(() => {
    if (status === 'unauthenticated') ensureSession().catch(setSessionErr);
  }, [status]);

  const doc = useApiQuery(['legal', 'kvkk_notice'], () => api.identityPublicLegalGet('kvkk_notice', { locale: 'tr' }), { enabled: step === 'consent' });

  const send = useApiMutation(() => api.identityAuthSendCode({ email: email.trim(), purpose: 'signup' }), {
    onSuccess: (d) => { setErr(''); setExists(false); setRetry(d?.retryAfterSeconds ?? 60); setStep('code'); },
    onError: (e) => {
      if (apiErrorCode(e) === 'AUTH_EMAIL_ALREADY_REGISTERED') { setExists(true); setErr(t('auth.signUp.exists')); } else setErr(getApiErrorMessage(e));
    },
  });
  const register = useApiMutation(
    () => api.identityAuthRegister({
      email: email.trim(), code, displayName: name.trim() || undefined,
      consents: [{ type: 'kvkk_notice', granted: true }, { type: 'terms_of_use', granted: true }, { type: 'marketing_email', granted: marketing }],
    }),
    {
      onSuccess: (data) => { applySession({ data: { data } }); nav(from || Routes.today, { replace: true }); },
      onError: (e) => {
        const c = apiErrorCode(e);
        setErr(getApiErrorMessage(e));
        if (c === 'AUTH_CODE_INVALID' || c === 'AUTH_CODE_LOCKED') setStep('code');
      },
    }
  );

  if (status === 'authenticated' && user && !isGuestUser(user)) return <Navigate to={from || Routes.today} replace />;
  if (status === 'unknown' || (status === 'unauthenticated' && !sessionErr)) return <BubbleLoader fullscreen />;

  const footer = <>{t('auth.signUp.alreadyHave')} <Link to={Routes.signIn} state={{ from }}>{t('auth.signUp.goSignIn')}</Link></>;
  const back = (to) => <Button variant="tertiary" size="sm" className={styles.back} onClick={() => { setErr(''); setStep(to); }}>{t('auth.back')}</Button>;

  if (step === 'code') {
    return (
      <AuthCard title={t('auth.code.title')} footer={footer}>
        <CodeEntry email={email.trim()} initialRetry={retry} error={err} onSubmit={(c) => { setErr(''); setCode(c); setStep('consent'); }} submitLabel={t('common.continue')}
          onResend={() => send.mutateAsync()} onChangeEmail={() => { setErr(''); setStep('email'); }} />
      </AuthCard>
    );
  }
  if (step === 'consent') {
    return (
      <AuthCard title={t('auth.consent.title')} subtitle={t('auth.consent.subtitle')} back={back('code')} footer={footer}>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); setErr(''); register.mutate(); }}>
          <Card padding="md">
            {doc.data?.summaryMd ? <Markdown source={doc.data.summaryMd} /> : <p className="muted">{doc.isLoading ? t('common.loading') : ''}</p>}
            <p className="t-body-s"><Link to={path(Routes.legal, { type: 'kvkk_notice' })} target="_blank">{t('auth.consent.fullText')}</Link> · <Link to={path(Routes.legal, { type: 'terms_of_use' })} target="_blank">{t('auth.consent.terms')}</Link></p>
          </Card>
          <label className={styles.check}>
            <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} />
            <span>{t('auth.consent.kvkk')}</span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            <span>{t('auth.consent.marketing')} <em className="muted">({t('auth.consent.optional')})</em></span>
          </label>
          <TextInput label={t('auth.signUp.displayName')} helper={t('auth.signUp.displayNameHelper')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" error={err} />
          <Button type="submit" size="lg" block loading={register.isPending} disabled={!kvkk}>{t('auth.signUp.create')}</Button>
          {!kvkk && <p className="t-caption muted">{t('auth.consent.required')}</p>}
        </form>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('auth.signUp.title')} subtitle={t('auth.signUp.subtitle')} footer={footer}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); setErr(''); send.mutate(); }}>
        <TextInput label={t('auth.email.label')} type="email" autoComplete="email" inputMode="email" placeholder={t('auth.email.placeholder')} value={email} onChange={(e) => setEmail(e.target.value)} error={err} helper={t('auth.signUp.passwordless')} autoFocus />
        {exists && <Button variant="secondary" block onClick={() => nav(Routes.signIn, { state: { from } })}>{t('auth.signUp.goSignIn')}</Button>}
        <Button type="submit" size="lg" block loading={send.isPending} disabled={!EMAIL_RE.test(email.trim())}>{t('auth.signUp.sendCode')}</Button>
        <p className="t-caption muted" style={{ textAlign: 'center' }}>{t('auth.signUp.social')}</p>
      </form>
    </AuthCard>
  );
}
